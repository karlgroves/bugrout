/**
 * Fuel stations come from OpenStreetMap (#200), through the public Overpass
 * API: gasoline and diesel, with no API key. Overpass is shared and often
 * busy, so every way it can fail must reach the caller as a failure — never as
 * an empty, "no fuel nearby" answer — and it refuses requests that don't
 * identify the app.
 */
import { overpassQuery } from "@/services/osm/overpass";
import { fetchOsmFuelStations } from "@/services/resources/FuelService";

const mockDeleteResourcesByType = jest.fn().mockResolvedValue(undefined);
const mockUpsertResourcePoints = jest.fn().mockResolvedValue(undefined);
jest.mock("@/db/queries/resources", () => ({
  deleteResourcesByType: (...args: unknown[]) =>
    mockDeleteResourcesByType(...args) as unknown,
  upsertResourcePoints: (...args: unknown[]) =>
    mockUpsertResourcePoints(...args) as unknown,
}));

jest.mock("expo-constants", () => ({ expoConfig: { version: "1.2.3" } }));

const BBOX = { west: -79.49, south: 37.91, east: -75.05, north: 39.72 };

/** The last fetch call's URL and options. */
function lastRequest(): { url: string; init: RequestInit } {
  const call = (global.fetch as jest.Mock).mock.calls.at(-1) as
    [string, RequestInit] | undefined;
  if (!call) throw new Error("fetch was not called");
  return { url: call[0], init: call[1] };
}

/** Make fetch answer with a status and a JSON body (or unparseable text). */
function respond(status: number, body: unknown): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      typeof body === "string"
        ? Promise.reject(new SyntaxError("Unexpected token <"))
        : Promise.resolve(body),
  });
}

describe("overpassQuery", () => {
  it("identifies the app, which Overpass requires", async () => {
    respond(200, { elements: [] });
    await overpassQuery("[out:json];node(1);out;");
    const headers = lastRequest().init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(
      "BugRout/1.2.3 (+https://bugrout.app/support)",
    );
  });

  it("throws on an HTTP refusal, such as 406 for a generic user agent", async () => {
    respond(406, {});
    await expect(overpassQuery("q")).rejects.toThrow("HTTP 406");
  });

  it("throws when a busy server answers 200 with an HTML page", async () => {
    respond(200, "<html>too busy</html>");
    await expect(overpassQuery("q")).rejects.toThrow(/busy/);
  });

  it("throws when the query timed out on the server", async () => {
    respond(200, {
      elements: [],
      remark:
        'runtime error: Query timed out in "query" at line 1 after 91 seconds.',
    });
    await expect(overpassQuery("q")).rejects.toThrow(/runtime error/);
  });
});

describe("fetchOsmFuelStations", () => {
  beforeEach(() => {
    mockDeleteResourcesByType.mockClear();
    mockUpsertResourcePoints.mockClear();
  });

  it("asks for amenity=fuel nodes and buildings in the region's bounds", async () => {
    respond(200, { elements: [] });
    await fetchOsmFuelStations(BBOX, "md");
    const query = decodeURIComponent(
      (lastRequest().init.body as string).replace(/^data=/, ""),
    );
    expect(query).toContain('nwr["amenity"="fuel"](37.91,-79.49,39.72,-75.05)');
    expect(query).toContain("out center");
  });

  it("maps stations drawn as points and as buildings", async () => {
    respond(200, {
      elements: [
        {
          type: "node",
          id: 1,
          lat: 39.3,
          lon: -76.6,
          tags: {
            amenity: "fuel",
            brand: "Shell",
            "fuel:diesel": "yes",
            "addr:housenumber": "1200",
            "addr:street": "Main Street",
            "addr:city": "Towson",
          },
        },
        {
          type: "way",
          id: 2,
          center: { lat: 39.31, lon: -76.61 },
          tags: { amenity: "fuel", name: "Corner Gas" },
        },
        { type: "way", id: 3, tags: { amenity: "fuel" } },
      ],
    });
    const stations = await fetchOsmFuelStations(BBOX, "md");

    expect(stations).toHaveLength(2);
    expect(stations[0]).toMatchObject({
      id: "osm-fuel-node-1",
      type: "fuel",
      name: "Shell",
      lat: 39.3,
      lng: -76.6,
      address: "1200 Main Street, Towson",
      source: "osm",
      regionId: "md",
      metadata: { brand: "Shell", diesel: true },
    });
    expect(stations[1]).toMatchObject({
      id: "osm-fuel-way-2",
      name: "Corner Gas",
      lat: 39.31,
      lng: -76.61,
      address: null,
      metadata: { brand: null, diesel: false },
    });
  });

  it("names an unnamed, unbranded station plainly", async () => {
    respond(200, {
      elements: [{ type: "node", id: 4, lat: 39, lon: -76, tags: {} }],
    });
    const [station] = await fetchOsmFuelStations(BBOX, "md");
    expect(station?.name).toBe("Fuel station");
  });

  it("replaces only the region's OSM fuel stations in the cache", async () => {
    respond(200, {
      elements: [{ type: "node", id: 1, lat: 39, lon: -76, tags: {} }],
    });
    await fetchOsmFuelStations(BBOX, "md");
    expect(mockDeleteResourcesByType).toHaveBeenCalledWith("md", "fuel", "osm");
    expect(mockUpsertResourcePoints).toHaveBeenCalledTimes(1);
  });

  it("leaves the cache alone when Overpass fails", async () => {
    respond(504, {});
    await expect(fetchOsmFuelStations(BBOX, "md")).rejects.toThrow();
    expect(mockDeleteResourcesByType).not.toHaveBeenCalled();
  });
});
