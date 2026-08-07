/**
 * Tests for the location platform shim's mock fallback.
 *
 * expo-location is mocked as unresolvable so the `catch` path runs — the same
 * path Expo Go takes. That mock track is what the navigation UI renders
 * against during development, so "it drifts" and "remove() actually stops it"
 * are the two properties worth pinning; a leaked interval here would keep
 * firing GPS updates after navigation ends.
 */

jest.mock("expo-location", () => {
  throw new Error("expo-location unavailable");
});

import {
  watchPositionAsync,
  getCurrentPositionAsync,
  hasServicesEnabledAsync,
} from "@/platform/location";

import type { LocationResult } from "@/platform/location";

/**
 * True when every value is strictly greater than the one before it.
 *
 * Iterates rather than indexing: `noUncheckedIndexedAccess` types indexed
 * elements as possibly undefined (and the repo bans both `!` and redundant
 * `as` casts), while bracket access would trip `detect-object-injection`.
 */
function strictlyIncreasing(values: number[]): boolean {
  if (values.length < 2) return false;
  let prev = Number.NEGATIVE_INFINITY;
  for (const cur of values) {
    if (cur <= prev) return false;
    prev = cur;
  }
  return true;
}

describe("watchPositionAsync — mock fallback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("emits a position roughly every second", async () => {
    const seen: LocationResult[] = [];
    const sub = await watchPositionAsync({}, (l) => seen.push(l));

    expect(seen).toHaveLength(0);
    jest.advanceTimersByTime(1000);
    expect(seen).toHaveLength(1);
    jest.advanceTimersByTime(2000);
    expect(seen).toHaveLength(3);

    sub.remove();
  });

  it("drifts north on each tick", async () => {
    const seen: LocationResult[] = [];
    const sub = await watchPositionAsync({}, (l) => seen.push(l));

    jest.advanceTimersByTime(3000);
    const lats = seen.map((l) => l.coords.latitude);
    expect(lats).toHaveLength(3);
    expect(strictlyIncreasing(lats)).toBe(true);

    sub.remove();
  });

  it("reports a plausible driving speed and accuracy", async () => {
    const seen: LocationResult[] = [];
    const sub = await watchPositionAsync({}, (l) => seen.push(l));

    jest.advanceTimersByTime(1000);
    expect(seen[0]?.coords.speed).toBe(13.4);
    expect(seen[0]?.coords.accuracy).toBe(10);

    sub.remove();
  });

  it("stops emitting once the subscription is removed", async () => {
    const seen: LocationResult[] = [];
    const sub = await watchPositionAsync({}, (l) => seen.push(l));

    jest.advanceTimersByTime(2000);
    const countAtRemoval = seen.length;
    sub.remove();

    jest.advanceTimersByTime(5000);
    expect(seen).toHaveLength(countAtRemoval);
  });

  it("removes only the subscription asked for", async () => {
    const a: LocationResult[] = [];
    const b: LocationResult[] = [];
    const subA = await watchPositionAsync({}, (l) => a.push(l));
    const subB = await watchPositionAsync({}, (l) => b.push(l));

    jest.advanceTimersByTime(1000);
    subA.remove();
    jest.advanceTimersByTime(2000);

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(3);

    subB.remove();
  });

  it("gives each subscriber its own drift state", async () => {
    // Shared drift state would make two concurrent subscribers advance the
    // same latitude, so the later subscriber's first fix would already be
    // ahead of the earlier one's.
    const a: LocationResult[] = [];
    const subA = await watchPositionAsync({}, (l) => a.push(l));
    jest.advanceTimersByTime(1000);

    const b: LocationResult[] = [];
    const subB = await watchPositionAsync({}, (l) => b.push(l));
    jest.advanceTimersByTime(1000);

    const firstOfA = a[0]?.coords.latitude;
    const firstOfB = b[0]?.coords.latitude;
    expect(firstOfA).toBeDefined();
    expect(firstOfB).toBeDefined();
    // Precision matters here: the drift step is 1e-4, so toBeCloseTo's default
    // of 2 decimal places would pass even with fully shared state.
    expect(firstOfB ?? 0).toBeCloseTo(firstOfA ?? -1, 6);

    subA.remove();
    subB.remove();
  });
});

describe("other fallbacks", () => {
  it("returns the fixed mock position", async () => {
    const pos = await getCurrentPositionAsync();
    expect(pos.coords.latitude).toBeCloseTo(37.7749);
    expect(pos.coords.longitude).toBeCloseTo(-122.4194);
  });

  it("assumes location services are enabled", async () => {
    await expect(hasServicesEnabledAsync()).resolves.toBe(true);
  });
});
