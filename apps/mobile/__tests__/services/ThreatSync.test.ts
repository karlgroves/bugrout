/**
 * A failed threat fetch is a failure, not "no active threats" (#288).
 *
 * Every threat source used to turn a failed or timed-out request into `[]`,
 * and the sync then stamped that source as fetched just now, so its TTL
 * suppressed every retry and the route was built with no fire avoidance while
 * reading as clear. A failure now keeps the cached threats, marks the source
 * failed, and leaves its TTL alone so the next sync retries.
 */
import { refreshThreats } from "@/services/threats/ThreatSync";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { useThreatStore } from "@/stores/useThreatStore";

import type { ThreatZone } from "@bugrout/shared";

const mockGetCachedThreats = jest.fn();
const mockClearThreatsBySource = jest.fn();
const mockUpsertThreatZones = jest.fn();
jest.mock("@/db/queries/threats", () => ({
  clearExpiredThreats: jest.fn().mockResolvedValue(undefined),
  getCachedThreats: (...args: unknown[]) =>
    mockGetCachedThreats(...args) as unknown,
  clearThreatsBySource: (...args: unknown[]) =>
    mockClearThreatsBySource(...args) as unknown,
  upsertThreatZones: (...args: unknown[]) =>
    mockUpsertThreatZones(...args) as unknown,
}));

const mockFetchNWSAlerts = jest.fn();
jest.mock("@/services/threats/NWSService", () => ({
  CACHE_TTL_MS: 3_600_000,
  fetchNWSAlerts: (...args: unknown[]) =>
    mockFetchNWSAlerts(...args) as unknown,
}));

const mockFetchFirePerimeters = jest.fn();
jest.mock("@/services/threats/USFSService", () => ({
  CACHE_TTL_MS: 43_200_000,
  fetchFirePerimeters: (...args: unknown[]) =>
    mockFetchFirePerimeters(...args) as unknown,
}));

jest.mock("@/services/threats/FEMAService", () => ({
  loadFloodZones: jest.fn().mockResolvedValue([]),
}));

const BBOX = { west: -79.5, south: 37.9, east: -75.0, north: 39.8 };

/** A wildfire threat from a source. */
function fire(id: string, source: ThreatZone["source"]): ThreatZone {
  return {
    id,
    type: "wildfire",
    severity: "severe",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-77, 39],
          [-76.9, 39],
          [-76.9, 39.1],
          [-77, 39],
        ],
      ],
    },
    headline: id,
    description: "",
    source,
    fetchedAt: 0,
    expiresAt: null,
  };
}

describe("refreshThreats — a failed fetch (#288)", () => {
  beforeEach(() => {
    mockGetCachedThreats.mockReset().mockResolvedValue([]);
    mockClearThreatsBySource.mockReset().mockResolvedValue(undefined);
    mockUpsertThreatZones.mockReset().mockResolvedValue(undefined);
    mockFetchNWSAlerts.mockReset().mockResolvedValue([]);
    mockFetchFirePerimeters.mockReset().mockResolvedValue([]);
    useConnectivityStore.setState({ isOnline: true });
    useThreatStore.setState({
      threatZones: [],
      lastFetched: {},
      failedSources: {},
    });
  });

  it("does not stamp a failed source as fetched", async () => {
    mockFetchFirePerimeters.mockRejectedValue(new Error("HTTP 503"));
    await refreshThreats(BBOX, "md");
    const { lastFetched, failedSources } = useThreatStore.getState();
    expect(lastFetched.usfs).toBeUndefined();
    expect(failedSources.usfs).toBe(true);
    // The source that succeeded is current and not failed.
    expect(lastFetched.nws).toEqual(expect.any(Number));
    expect(failedSources.nws).toBe(false);
  });

  it("retries a failed source on the next sync instead of waiting out its TTL", async () => {
    mockFetchNWSAlerts.mockRejectedValueOnce(new Error("timeout"));
    await refreshThreats(BBOX, "md");
    expect(mockFetchNWSAlerts).toHaveBeenCalledTimes(1);

    mockFetchNWSAlerts.mockResolvedValueOnce([fire("alert-1", "nws")]);
    await refreshThreats(BBOX, "md");
    expect(mockFetchNWSAlerts).toHaveBeenCalledTimes(2);
    const { failedSources, threatZones } = useThreatStore.getState();
    expect(failedSources.nws).toBe(false);
    expect(threatZones.map((t) => t.id)).toContain("alert-1");
  });

  it("keeps the cached threats of a failed source", async () => {
    mockGetCachedThreats.mockResolvedValue([fire("cached-fire", "usfs")]);
    mockFetchFirePerimeters.mockRejectedValue(new Error("HTTP 503"));
    await refreshThreats(BBOX, "md");
    expect(useThreatStore.getState().threatZones.map((t) => t.id)).toEqual([
      "cached-fire",
    ]);
    expect(mockClearThreatsBySource).not.toHaveBeenCalledWith("usfs");
  });

  it("replaces a source's cached threats with the fresh set (#291)", async () => {
    mockGetCachedThreats.mockResolvedValue([
      fire("fire-1", "usfs"),
      fire("alert-0", "nws"),
    ]);
    mockFetchFirePerimeters.mockResolvedValue([fire("fire-7", "usfs")]);
    await refreshThreats(BBOX, "md");
    expect(mockClearThreatsBySource).toHaveBeenCalledWith("usfs");
    const ids = useThreatStore.getState().threatZones.map((t) => t.id);
    expect(ids).toEqual(["alert-0", "fire-7"]);
  });

  it("still skips a source that succeeded within its TTL", async () => {
    await refreshThreats(BBOX, "md");
    await refreshThreats(BBOX, "md");
    expect(mockFetchNWSAlerts).toHaveBeenCalledTimes(1);
    expect(mockFetchFirePerimeters).toHaveBeenCalledTimes(1);
  });
});
