/**
 * Overpass fuel coordinates are checked before they replace the packaged ones
 * (#342). A region package ships a usable fuel layer; an online refresh
 * deletes it and writes whatever Overpass answered. Overpass is open data, so
 * an element can carry a coordinate that is out of range, not a number at all,
 * or placed nowhere near the region that was queried — and #295 showed where a
 * mis-placed fuel station ends up: as a mandatory Valhalla `through` point that
 * destroys a route which had already succeeded.
 *
 * The posture matches the threat feeds (#338): one unusable element is dropped,
 * and an answer that carried elements of which none are usable is a failure
 * that keeps the cache, rather than a degraded set that replaces good data.
 */
import { fetchOsmFuelStations } from "@/services/resources/FuelService";

import type { ResourcePoint } from "@bugrout/shared";

const mockDeleteResourcesByType = jest.fn().mockResolvedValue(undefined);
const mockUpsertResourcePoints = jest.fn().mockResolvedValue(undefined);
const mockGetResourcesByRegion = jest
  .fn<Promise<Partial<ResourcePoint>[]>, unknown[]>()
  .mockResolvedValue([]);
jest.mock("@/db/queries/resources", () => ({
  deleteResourcesByType: (...args: unknown[]) =>
    mockDeleteResourcesByType(...args) as unknown,
  getResourcesByRegion: (...args: unknown[]) =>
    mockGetResourcesByRegion(...args),
  upsertResourcePoints: (...args: unknown[]) =>
    mockUpsertResourcePoints(...args) as unknown,
}));

jest.mock("expo-constants", () => ({ expoConfig: { version: "1.2.3" } }));

/** Maryland, the bounds the fixtures are queried against. */
const BBOX = { west: -79.49, south: 37.91, east: -75.05, north: 39.72 };

/** A station well inside BBOX, used as the usable element alongside bad ones. */
const GOOD = {
  type: "node",
  id: 1,
  lat: 39.3,
  lon: -76.6,
  tags: { amenity: "fuel", name: "Good Gas" },
};

/** Make fetch answer 200 with these Overpass elements. */
function respondWith(elements: unknown[]): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ elements }),
  });
}

beforeEach(() => {
  mockDeleteResourcesByType.mockClear();
  mockUpsertResourcePoints.mockClear();
});

describe("fetchOsmFuelStations coordinate validation", () => {
  it("drops a station whose latitude is out of range", async () => {
    respondWith([GOOD, { type: "node", id: 2, lat: 91, lon: -76.6, tags: {} }]);
    const stations = await fetchOsmFuelStations(BBOX, "md");
    expect(stations.map((s) => s.id)).toEqual(["osm-fuel-node-1"]);
  });

  it("drops a station whose longitude is out of range", async () => {
    respondWith([
      GOOD,
      { type: "node", id: 2, lat: 39.3, lon: -181, tags: {} },
    ]);
    const stations = await fetchOsmFuelStations(BBOX, "md");
    expect(stations.map((s) => s.id)).toEqual(["osm-fuel-node-1"]);
  });

  it("drops a station whose coordinate is not a number", async () => {
    respondWith([
      GOOD,
      { type: "node", id: 2, lat: "39.3", lon: -76.6, tags: {} },
      { type: "node", id: 3, lat: null, lon: -76.6, tags: {} },
      { type: "way", id: 4, center: { lat: 39.3, lon: "x" }, tags: {} },
    ]);
    const stations = await fetchOsmFuelStations(BBOX, "md");
    expect(stations.map((s) => s.id)).toEqual(["osm-fuel-node-1"]);
  });

  it("drops a station at null island, far from the region queried", async () => {
    respondWith([GOOD, { type: "node", id: 2, lat: 0, lon: 0, tags: {} }]);
    const stations = await fetchOsmFuelStations(BBOX, "md");
    expect(stations.map((s) => s.id)).toEqual(["osm-fuel-node-1"]);
  });

  it("drops a station whose latitude and longitude are transposed", async () => {
    // In range, so only the region check catches it: Maryland's own numbers
    // swapped put the station in Kazakhstan.
    respondWith([
      GOOD,
      { type: "node", id: 2, lat: 76.6, lon: -39.3, tags: {} },
    ]);
    const stations = await fetchOsmFuelStations(BBOX, "md");
    expect(stations.map((s) => s.id)).toEqual(["osm-fuel-node-1"]);
  });

  it("keeps a station just outside the bounds, as a way's centre can be", async () => {
    respondWith([
      { type: "way", id: 7, center: { lat: 39.723, lon: -76.6 }, tags: {} },
    ]);
    const stations = await fetchOsmFuelStations(BBOX, "md");
    expect(stations.map((s) => s.id)).toEqual(["osm-fuel-way-7"]);
  });

  it("still replaces the cache when only some stations are unusable", async () => {
    respondWith([GOOD, { type: "node", id: 2, lat: 0, lon: 0, tags: {} }]);
    await fetchOsmFuelStations(BBOX, "md");
    expect(mockDeleteResourcesByType).toHaveBeenCalledWith("md", "fuel", "osm");
    expect(mockUpsertResourcePoints).toHaveBeenCalledTimes(1);
  });

  it("fails and keeps the packaged stations when no station is usable", async () => {
    respondWith([
      { type: "node", id: 2, lat: 0, lon: 0, tags: {} },
      { type: "node", id: 3, lat: 91, lon: -76.6, tags: {} },
    ]);
    await expect(fetchOsmFuelStations(BBOX, "md")).rejects.toThrow(
      /no usable fuel station/i,
    );
    expect(mockDeleteResourcesByType).not.toHaveBeenCalled();
    expect(mockUpsertResourcePoints).not.toHaveBeenCalled();
  });

  it("treats an answer with no elements as an empty region, not a failure", async () => {
    respondWith([]);
    const stations = await fetchOsmFuelStations(BBOX, "md");
    expect(stations).toEqual([]);
    expect(mockDeleteResourcesByType).toHaveBeenCalledWith("md", "fuel", "osm");
  });
});
