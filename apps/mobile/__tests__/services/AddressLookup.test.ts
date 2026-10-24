/**
 * Every way a plan's address lookup can end (#187).
 *
 * Two of these are the point of the exercise and must never collapse into
 * "saved anyway": several matches have to reach the user rather than be
 * resolved by taking the first, and a failed request must not be reported as
 * a bad address — the address may be perfectly good and the network not.
 */
import {
  lookupAddress,
  lookupMessage,
} from "@/services/geocoding/AddressLookup";
import {
  DisclaimerNotAcceptedError,
  SearchSupersededError,
} from "@/services/geocoding/Geocoder";

import type { GeocodeResult } from "@/services/geocoding/Geocoder";
import type * as GeocoderModule from "@/services/geocoding/Geocoder";

const mockSearch = jest.fn();
jest.mock("@/services/geocoding/Geocoder", () => {
  const actual = jest.requireActual<typeof GeocoderModule>(
    "@/services/geocoding/Geocoder",
  );
  return {
    ...actual,
    searchDestinations: (q: string) =>
      mockSearch(q) as Promise<GeocodeResult[]>,
  };
});

/**
 * Build a geocoder result.
 */
function result(displayName: string, lat: number, lng: number): GeocodeResult {
  return { displayName, shortName: displayName.split(",")[0] ?? "", lat, lng };
}

const TOWSON = result("120 Main St, Towson, MD, USA", 39.4, -76.6);
const SPRINGFIELD_IL = result("Springfield, Illinois, USA", 39.78, -89.65);
const SPRINGFIELD_MA = result("Springfield, Massachusetts, USA", 42.1, -72.59);

beforeEach(() => {
  mockSearch.mockReset();
});

describe("lookupAddress", () => {
  it("sends nothing for a blank address", async () => {
    expect(await lookupAddress("   ")).toEqual({ kind: "none" });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("trims what it sends", async () => {
    mockSearch.mockResolvedValue([TOWSON]);
    await lookupAddress("  120 Main St  ");
    expect(mockSearch).toHaveBeenCalledWith("120 Main St");
  });

  it("returns the single match", async () => {
    mockSearch.mockResolvedValue([TOWSON]);
    expect(await lookupAddress("120 Main St")).toEqual({
      kind: "one",
      match: TOWSON,
    });
  });

  it("offers every match rather than taking the first", async () => {
    mockSearch.mockResolvedValue([SPRINGFIELD_IL, SPRINGFIELD_MA]);
    const lookup = await lookupAddress("Springfield");
    expect(lookup).toEqual({
      kind: "many",
      matches: [SPRINGFIELD_IL, SPRINGFIELD_MA],
    });
  });

  it("reports no match when the geocoder knows the place does not exist", async () => {
    mockSearch.mockResolvedValue([]);
    expect(await lookupAddress("zzzz")).toEqual({ kind: "none" });
  });

  it("calls a failed request offline, not a bad address", async () => {
    mockSearch.mockRejectedValue(new TypeError("Network request failed"));
    expect(await lookupAddress("120 Main St")).toEqual({ kind: "offline" });
  });

  it("reports an unaccepted disclaimer as its own outcome", async () => {
    mockSearch.mockRejectedValue(new DisclaimerNotAcceptedError());
    expect(await lookupAddress("120 Main St")).toEqual({
      kind: "not-disclosed",
    });
  });

  it("reports a superseded lookup as its own outcome", async () => {
    mockSearch.mockRejectedValue(new SearchSupersededError());
    expect(await lookupAddress("120 Main St")).toEqual({ kind: "superseded" });
  });
});

describe("lookupMessage", () => {
  it("says nothing for the outcomes that save or ask", () => {
    expect(lookupMessage({ kind: "one", match: TOWSON })).toBe(null);
    expect(lookupMessage({ kind: "many", matches: [TOWSON] })).toBe(null);
    expect(lookupMessage({ kind: "superseded" })).toBe(null);
  });

  it("points a failed match at the pin, without blaming the network", () => {
    const message = lookupMessage({ kind: "none" });
    expect(message?.title).toBe("Couldn't find that address");
    expect(message?.body).toContain("dropping a pin");
  });

  it("says offline is about the connection, not the address", () => {
    const message = lookupMessage({ kind: "offline" });
    expect(message?.title).toBe("You're offline");
    // The distinction that matters: it must not tell the user their address
    // is wrong when it never got to ask.
    expect(message?.body).not.toContain("Check the address");
    expect(message?.body).toContain("needs no connection");
  });

  it("explains the disclaimer rather than failing silently", () => {
    const message = lookupMessage({ kind: "not-disclosed" });
    expect(message?.title).toBe("Accept the disclaimer first");
    expect(message?.body).toContain("drop a pin");
  });
});
