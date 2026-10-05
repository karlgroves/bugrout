/**
 * The resource sync fetches for every state region and reports how current
 * the shelters are (#201).
 *
 * The region-to-state table used to hold only ca, tx and fl, so for Maryland —
 * the only published region — no resource layer was ever fetched. A failed
 * shelter fetch was swallowed, leaving an empty layer that read as "none".
 */
import { refreshResources } from "@/services/resources/ResourceSync";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { useResourceStore } from "@/stores/useResourceStore";

import type { ResourcePoint } from "@bugrout/shared";

const mockGetResourcesByRegion = jest.fn();
jest.mock("@/db/queries/resources", () => ({
  getResourcesByRegion: (...args: unknown[]) =>
    mockGetResourcesByRegion(...args) as unknown,
}));

const mockFetchWaterSources = jest.fn();
jest.mock("@/services/resources/USGSService", () => ({
  CACHE_TTL_MS: 86_400_000,
  fetchWaterSources: (...args: unknown[]) =>
    mockFetchWaterSources(...args) as unknown,
}));

const mockFetchShelters = jest.fn();
jest.mock("@/services/resources/ShelterService", () => ({
  CACHE_TTL_MS: 3_600_000,
  fetchShelters: (...args: unknown[]) => mockFetchShelters(...args) as unknown,
}));

jest.mock("@/services/resources/NRELService", () => ({
  CACHE_TTL_MS: 86_400_000,
  fetchFuelStations: jest.fn().mockResolvedValue([]),
}));

const BBOX = { west: -79.5, south: 37.9, east: -75.0, north: 39.8 };

/** A resource of a type, fetched at a time. */
function point(
  id: string,
  type: ResourcePoint["type"],
  fetchedAt: number,
): ResourcePoint {
  return {
    id,
    type,
    name: id,
    lat: 39,
    lng: -76,
    address: null,
    metadata: {},
    source: type === "shelter" ? "fema" : "usgs",
    fetchedAt,
    regionId: "md",
  };
}

describe("refreshResources", () => {
  beforeEach(() => {
    mockGetResourcesByRegion.mockReset().mockResolvedValue([]);
    mockFetchWaterSources.mockReset().mockResolvedValue([]);
    mockFetchShelters.mockReset().mockResolvedValue([]);
    useConnectivityStore.setState({ isOnline: true });
    useResourceStore.setState({
      resources: [],
      shelterStatus: { asOf: null, failed: false },
    });
  });

  it("fetches Maryland's resources with its state code", async () => {
    await refreshResources("md", BBOX);
    expect(mockFetchWaterSources).toHaveBeenCalledWith("MD", BBOX, "md");
    expect(mockFetchShelters).toHaveBeenCalledWith(BBOX, "md");
  });

  it("fetches nothing for an id that isn't a state code", async () => {
    await refreshResources("demo-region", BBOX);
    expect(mockFetchWaterSources).not.toHaveBeenCalled();
    expect(mockFetchShelters).not.toHaveBeenCalled();
  });

  it("replaces the shelters and marks them current on success", async () => {
    const stale = point("old-shelter", "shelter", 1);
    const water = point("well", "water", Date.now());
    mockGetResourcesByRegion.mockResolvedValue([stale, water]);
    const fresh = point("fema-1", "shelter", Date.now());
    mockFetchShelters.mockResolvedValue([fresh]);

    const before = Date.now();
    await refreshResources("md", BBOX);

    const { resources, shelterStatus } = useResourceStore.getState();
    expect(resources.map((r) => r.id).sort()).toEqual(["fema-1", "well"]);
    expect(shelterStatus.failed).toBe(false);
    expect(shelterStatus.asOf).toBeGreaterThanOrEqual(before);
  });

  it("reports a failed shelter fetch, keeping the cached shelters and their time", async () => {
    const cached = point("old-shelter", "shelter", 1_000);
    mockGetResourcesByRegion.mockResolvedValue([cached]);
    mockFetchShelters.mockRejectedValue(new Error("FEMA shelters: HTTP 503"));

    await refreshResources("md", BBOX);

    const { resources, shelterStatus } = useResourceStore.getState();
    expect(resources.map((r) => r.id)).toEqual(["old-shelter"]);
    expect(shelterStatus).toEqual({ asOf: 1_000, failed: true });
  });

  it("offline, reports the cached shelters' time without fetching", async () => {
    useConnectivityStore.setState({ isOnline: false });
    mockGetResourcesByRegion.mockResolvedValue([
      point("a", "shelter", 1_000),
      point("b", "shelter", 2_000),
    ]);

    await refreshResources("md", BBOX);

    expect(mockFetchShelters).not.toHaveBeenCalled();
    expect(useResourceStore.getState().shelterStatus).toEqual({
      asOf: 2_000,
      failed: false,
    });
  });
});
