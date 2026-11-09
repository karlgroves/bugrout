/**
 * Destination search stays within Nominatim's usage policy (#208).
 *
 * The OSM Foundation bans apps that send a generic User-Agent or more than one
 * request per second — and an evacuation is when every install searches at
 * once. The UA used to be "BugRout/1.0", and the picker's 400 ms debounce let a
 * steady typist send two or three a second.
 *
 * Two limits of what this file can prove are worth stating, because a green
 * suite here has already been mistaken for compliance:
 *
 * - The 1 req/s cap is **per application** ("the sum of traffic by all your
 *   users should not exceed the limits"), so the interval pinned below bounds
 *   one device and nothing more.
 * - The policy's ban on client-side auto-complete is a property of the caller,
 *   not of this module. It is pinned in
 *   `__tests__/screens/destinationSearchSubmit.test.tsx`.
 */

import type * as GeocoderNamespace from "@/services/geocoding/Geocoder";

type Geocoder = typeof GeocoderNamespace;

jest.mock("@/db/queries/preferences", () => ({
  getPreference: () => Promise.resolve("true"),
}));
jest.mock("expo-constants", () => ({ expoConfig: { version: "1.2.3" } }));

let fetchSpy: jest.Mock<Promise<Response>, [string, RequestInit]>;

/** A fresh Geocoder, so its rate-limit state starts clean in every test. */
function loadGeocoder(): Geocoder {
  let mod: Geocoder | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a require for fresh module state
    mod = require("@/services/geocoding/Geocoder") as Geocoder;
  });
  if (!mod) throw new Error("failed to load Geocoder");
  return mod;
}

beforeEach(() => {
  jest.useFakeTimers();
  fetchSpy = jest.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(new Response("[]", { status: 200 })),
  );
  global.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

/** The User-Agent header of the nth request sent. */
function userAgentOf(call: number): string | undefined {
  const init = fetchSpy.mock.calls[call]?.[1];
  return (init?.headers as Record<string, string> | undefined)?.["User-Agent"];
}

describe("Nominatim User-Agent", () => {
  it("names the app, its version and a contact URL", async () => {
    const geocoder = loadGeocoder();
    await geocoder.searchDestinations("baltimore");

    expect(userAgentOf(0)).toBe("BugRout/1.2.3 (+https://bugrout.app/support)");
  });
});

describe("switchable endpoint", () => {
  it("sends to the configured geocoder rather than a hardcoded host", async () => {
    process.env.EXPO_PUBLIC_GEOCODER_URL = "https://geocode.example.test";
    try {
      const geocoder = loadGeocoder();
      await geocoder.searchDestinations("baltimore");

      const sent = new URL(String(fetchSpy.mock.calls[0]?.[0]));
      expect(sent.origin).toBe("https://geocode.example.test");
      expect(sent.pathname).toBe("/search");
    } finally {
      delete process.env.EXPO_PUBLIC_GEOCODER_URL;
    }
  });

  it("falls back to the public endpoint when nothing is configured", async () => {
    const geocoder = loadGeocoder();
    await geocoder.searchDestinations("baltimore");

    expect(new URL(String(fetchSpy.mock.calls[0]?.[0])).origin).toBe(
      "https://nominatim.openstreetmap.org",
    );
  });
});

describe("one request per second", () => {
  it("sends the first search at once and holds the next for a second", async () => {
    const geocoder = loadGeocoder();

    await geocoder.searchDestinations("balt");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const second = geocoder.searchDestinations("baltimore");
    await jest.advanceTimersByTimeAsync(999);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    await second;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("drops a waiting search when a newer one arrives, sending only the newest", async () => {
    const geocoder = loadGeocoder();
    await geocoder.searchDestinations("bal");

    const stale = geocoder.searchDestinations("balti");
    const newest = geocoder.searchDestinations("baltimore");
    const staleOutcome = stale.catch((err: unknown) => err);

    await jest.advanceTimersByTimeAsync(1000);
    await newest;

    expect(await staleOutcome).toBeInstanceOf(geocoder.SearchSupersededError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const sentUrl = String(fetchSpy.mock.calls[1]?.[0]);
    expect(new URL(sentUrl).searchParams.get("q")).toBe("baltimore");
  });

  it("doesn't delay a search when the last one was over a second ago", async () => {
    const geocoder = loadGeocoder();
    await geocoder.searchDestinations("annapolis");
    await jest.advanceTimersByTimeAsync(1500);

    await geocoder.searchDestinations("towson");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
