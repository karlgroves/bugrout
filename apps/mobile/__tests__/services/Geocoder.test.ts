/**
 * Tests for the destination geocoder's disclaimer gate.
 *
 * The bundled privacy policy discloses that the destination search box sends
 * what you type to Nominatim. That disclosure is shown behind the first-launch
 * disclaimer, so a search issued before the disclaimer is accepted would be a
 * transmission the user was told about only afterwards.
 */

import { getPreference } from "@/db/queries/preferences";
import {
  DisclaimerNotAcceptedError,
  buildShortName,
  searchDestinations,
} from "@/services/geocoding/Geocoder";

jest.mock("@/db/queries/preferences", () => ({
  getPreference: jest.fn(),
}));

const mockGetPreference = getPreference as jest.MockedFunction<
  typeof getPreference
>;

describe("searchDestinations — disclaimer gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("makes no network call at all before the disclaimer is accepted", async () => {
    mockGetPreference.mockResolvedValue(null);

    await expect(searchDestinations("oakland")).rejects.toBeInstanceOf(
      DisclaimerNotAcceptedError,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("makes no network call when the disclaimer was explicitly declined", async () => {
    mockGetPreference.mockResolvedValue("false");

    await expect(searchDestinations("oakland")).rejects.toBeInstanceOf(
      DisclaimerNotAcceptedError,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not treat a truthy-looking non-'true' value as acceptance", async () => {
    mockGetPreference.mockResolvedValue("TRUE");

    await expect(searchDestinations("oakland")).rejects.toBeInstanceOf(
      DisclaimerNotAcceptedError,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("checks the gate before touching the network, not alongside it", async () => {
    mockGetPreference.mockResolvedValue(null);
    await searchDestinations("oakland").catch(() => undefined);
    expect(mockGetPreference).toHaveBeenCalledWith("disclaimer_accepted");
  });

  it("searches once the disclaimer has been accepted", async () => {
    mockGetPreference.mockResolvedValue("true");
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            display_name: "120 Main St, Oakland, CA, USA",
            lat: "37.8044",
            lon: "-122.2712",
            address: {
              house_number: "120",
              road: "Main St",
              city: "Oakland",
              state: "CA",
            },
          },
        ]),
    });

    const results = await searchDestinations("120 main");

    expect(results).toEqual([
      {
        displayName: "120 Main St, Oakland, CA, USA",
        shortName: "120 Main St, Oakland, CA",
        lat: 37.8044,
        lng: -122.2712,
      },
    ]);
  });

  it("sends the query to nominatim.openstreetmap.org and nowhere else", async () => {
    mockGetPreference.mockResolvedValue("true");
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await searchDestinations("safe place");

    const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    const requested = mockFetch.mock.calls[0]?.[0];
    // The geocoder always passes a string URL; assert that rather than coercing.
    expect(typeof requested).toBe("string");
    const url = requested as string;
    expect(url).toContain("https://nominatim.openstreetmap.org/search");
    expect(url).toContain("q=safe+place");
    expect(url).toContain("countrycodes=us");
    expect(mockFetch.mock.calls).toHaveLength(1);
  });

  it("returns an empty list rather than throwing on a non-OK response", async () => {
    mockGetPreference.mockResolvedValue("true");
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    await expect(searchDestinations("x")).resolves.toEqual([]);
  });
});

describe("buildShortName", () => {
  it("prefers house number and road", () => {
    expect(
      buildShortName(
        { house_number: "12", road: "Oak Ave", city: "Reno", state: "NV" },
        "full",
      ),
    ).toBe("12 Oak Ave, Reno, NV");
  });

  it("falls back through city, town, village", () => {
    expect(buildShortName({ village: "Tiny", state: "CA" }, "full")).toBe(
      "Tiny, CA",
    );
  });

  it("falls back to the first segment of the display name", () => {
    expect(buildShortName(undefined, "Somewhere, CA, USA")).toBe("Somewhere");
  });

  it("falls back when the address object yields no parts", () => {
    expect(buildShortName({}, "Somewhere, CA, USA")).toBe("Somewhere");
  });
});
