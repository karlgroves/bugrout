/**
 * Shelters come from FEMA's National Shelter System (#201).
 *
 * The Red Cross endpoint the app used to query has answered HTTP 403 since at
 * least 2026-09-30, and every failure became an empty layer — which looks
 * exactly like "no shelters nearby". These pin the replacement source, the
 * replace-not-merge cache, and that a failure is reported rather than eaten.
 */
import { fetchShelters } from "@/services/resources/ShelterService";

const mockDeleteResourcesByType = jest.fn().mockResolvedValue(undefined);
const mockUpsertResourcePoints = jest.fn().mockResolvedValue(undefined);
jest.mock("@/db/queries/resources", () => ({
  deleteResourcesByType: (...args: unknown[]) =>
    mockDeleteResourcesByType(...args) as unknown,
  upsertResourcePoints: (...args: unknown[]) =>
    mockUpsertResourcePoints(...args) as unknown,
}));

const BBOX = { west: -79.5, south: 37.9, east: -75.0, north: 39.8 };

/** A FEMA ArcGIS JSON response with the given body. */
function respond(body: unknown, status = 200): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

const OPEN_SHELTER = {
  attributes: {
    shelter_id: 401234,
    shelter_name: "Towson High School",
    address: "69 Cedar Ave",
    city: "Towson",
    state: "MD",
    zip: "21286",
    shelter_status: "OPEN",
    evacuation_capacity: 250,
    total_population: 31,
  },
  geometry: { x: -76.6, y: 39.4 },
};

describe("fetchShelters", () => {
  beforeEach(() => {
    mockDeleteResourcesByType.mockClear();
    mockUpsertResourcePoints.mockClear();
  });

  it("queries FEMA's open-shelters layer inside the region's bounds", async () => {
    respond({ features: [] });
    await fetchShelters(BBOX, "md");

    const url = new URL(
      (global.fetch as jest.Mock<Promise<unknown>, [string]>).mock
        .calls[0]?.[0] ?? "",
    );
    expect(url.origin + url.pathname).toBe(
      "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0/query",
    );
    expect(url.searchParams.get("geometry")).toBe("-79.5,37.9,-75,39.8");
    expect(url.searchParams.get("geometryType")).toBe("esriGeometryEnvelope");
    expect(url.searchParams.get("inSR")).toBe("4326");
    expect(url.searchParams.get("outSR")).toBe("4326");
  });

  it("maps each shelter with its status, capacity and address", async () => {
    respond({ features: [OPEN_SHELTER] });
    const [shelter] = await fetchShelters(BBOX, "md");

    expect(shelter).toMatchObject({
      id: "fema-401234",
      type: "shelter",
      name: "Towson High School",
      lat: 39.4,
      lng: -76.6,
      address: "69 Cedar Ave, Towson, MD, 21286",
      source: "fema",
      regionId: "md",
      metadata: {
        status: "OPEN",
        evacuationCapacity: 250,
        population: 31,
      },
    });
  });

  it("skips a shelter without a location", async () => {
    respond({ features: [{ ...OPEN_SHELTER, geometry: null }] });
    await expect(fetchShelters(BBOX, "md")).resolves.toEqual([]);
  });

  it("replaces the region's cached shelters, so closed ones disappear", async () => {
    respond({ features: [OPEN_SHELTER] });
    await fetchShelters(BBOX, "md");

    expect(mockDeleteResourcesByType).toHaveBeenCalledWith("md", "shelter");
    expect(mockUpsertResourcePoints).toHaveBeenCalledTimes(1);
    expect(mockDeleteResourcesByType.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpsertResourcePoints.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("clears the cache when no shelter is open", async () => {
    respond({ features: [] });
    await expect(fetchShelters(BBOX, "md")).resolves.toEqual([]);
    expect(mockDeleteResourcesByType).toHaveBeenCalledWith("md", "shelter");
  });

  it("throws on an HTTP error and leaves the cache alone", async () => {
    respond({}, 403);
    await expect(fetchShelters(BBOX, "md")).rejects.toThrow("HTTP 403");
    expect(mockDeleteResourcesByType).not.toHaveBeenCalled();
  });

  it("throws on an ArcGIS error body, which arrives as HTTP 200", async () => {
    respond({ error: { code: 400, message: "Invalid query" } });
    await expect(fetchShelters(BBOX, "md")).rejects.toThrow("Invalid query");
    expect(mockDeleteResourcesByType).not.toHaveBeenCalled();
  });
});
