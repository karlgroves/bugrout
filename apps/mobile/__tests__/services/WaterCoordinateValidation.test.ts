/**
 * Overpass water sources are checked the way Overpass fuel stations are (#360).
 * The water path used to keep an element when `el.lat && el.lon` was truthy,
 * which is wrong in both directions: a zero coordinate is a real place and was
 * dropped, while a string, an out-of-range number or a coordinate nowhere near
 * the region queried was kept and cached as a routable water stop.
 */
import { fetchWaterSources } from "@/services/resources/USGSService";

import type { ResourcePoint } from "@bugrout/shared";

const mockUpsertResourcePoints = jest.fn().mockResolvedValue(undefined);
jest.mock("@/db/queries/resources", () => ({
  upsertResourcePoints: (...args: unknown[]) =>
    mockUpsertResourcePoints(...args) as unknown,
}));

jest.mock("expo-constants", () => ({ expoConfig: { version: "1.2.3" } }));

/** Maryland, the bounds the fixtures are queried against. */
const BBOX = { west: -79.49, south: 37.91, east: -75.05, north: 39.72 };

/** A spring well inside BBOX, used as the usable element alongside bad ones. */
const GOOD = {
  type: "node",
  id: 1,
  lat: 39.3,
  lon: -76.6,
  tags: { natural: "spring", name: "Good Spring" },
};

/** A USGS answer with one stream gauge, in the RDB shape the service parses. */
const USGS_RDB = [
  "# comment",
  "agency_cd\tsite_no\tstation_nm\tsite_tp_cd\tdec_lat_va\tdec_long_va",
  "5s\t15s\t50s\t7s\t16s\t16s",
  "USGS\t01589000\tPATAPSCO RIVER\tST\t39.31\t-76.79",
].join("\n");

/**
 * Make Overpass answer 200 with these elements. USGS answers with `usgs`, or
 * fails when none is given, so the result is the OSM sources alone.
 */
function respondWith(elements: unknown[], usgs?: string): void {
  global.fetch = jest.fn((url: string) =>
    Promise.resolve(
      url.includes("waterservices.usgs.gov")
        ? {
            ok: usgs !== undefined,
            status: usgs === undefined ? 503 : 200,
            text: () => Promise.resolve(usgs ?? ""),
          }
        : {
            ok: true,
            status: 200,
            json: () => Promise.resolve({ elements }),
          },
    ),
  ) as unknown as typeof fetch;
}

/** The ids of the sources a fetch returned. */
async function fetchIds(bbox = BBOX): Promise<string[]> {
  const sources = await fetchWaterSources("MD", bbox, "md");
  return sources.map((s) => s.id);
}

beforeEach(() => {
  mockUpsertResourcePoints.mockClear();
});

describe("fetchWaterSources Overpass coordinate validation", () => {
  it("keeps a source on the equator or the prime meridian", async () => {
    // Zero is a coordinate, not a missing one.
    respondWith([
      { type: "node", id: 2, lat: 0, lon: 0.5, tags: {} },
      { type: "node", id: 3, lat: 0.5, lon: 0, tags: {} },
    ]);
    const ids = await fetchIds({ west: -1, south: -1, east: 1, north: 1 });
    expect(ids).toEqual(["osm-2", "osm-3"]);
  });

  it("drops a source whose coordinate is not a number", async () => {
    respondWith([
      GOOD,
      { type: "node", id: 2, lat: "39.3", lon: -76.6, tags: {} },
      { type: "node", id: 3, lat: 39.3, lon: "-76.6", tags: {} },
      { type: "node", id: 4, lat: null, lon: -76.6, tags: {} },
    ]);
    expect(await fetchIds()).toEqual(["osm-1"]);
  });

  it("drops a source whose coordinate is out of range", async () => {
    respondWith([
      GOOD,
      { type: "node", id: 2, lat: 91, lon: -76.6, tags: {} },
      { type: "node", id: 3, lat: 39.3, lon: -181, tags: {} },
    ]);
    expect(await fetchIds()).toEqual(["osm-1"]);
  });

  it("drops a source whose latitude and longitude are transposed", async () => {
    // In range, so only the region check catches it.
    respondWith([
      GOOD,
      { type: "node", id: 2, lat: 76.6, lon: -39.3, tags: {} },
    ]);
    expect(await fetchIds()).toEqual(["osm-1"]);
  });

  it("drops a source several kilometres outside the bounds queried", async () => {
    // 0.1 degrees north of the bbox is about 11 km.
    respondWith([
      GOOD,
      { type: "node", id: 2, lat: 39.82, lon: -76.6, tags: {} },
    ]);
    expect(await fetchIds()).toEqual(["osm-1"]);
  });

  it("caches only the usable sources, with numeric coordinates", async () => {
    respondWith([
      GOOD,
      { type: "node", id: 2, lat: "39.3", lon: -76.6, tags: {} },
    ]);
    await fetchWaterSources("MD", BBOX, "md");
    const [cached] = mockUpsertResourcePoints.mock.calls.at(-1) as [
      ResourcePoint[],
    ];
    expect(cached.map((s) => [s.id, s.lat, s.lng])).toEqual([
      ["osm-1", 39.3, -76.6],
    ]);
  });

  it("keeps the USGS sites when no Overpass source is usable", async () => {
    respondWith(
      [
        { type: "node", id: 2, lat: "39.3", lon: -76.6, tags: {} },
        { type: "node", id: 3, lat: 91, lon: -76.6, tags: {} },
      ],
      USGS_RDB,
    );
    expect(await fetchIds()).toEqual(["usgs-01589000"]);
  });
});
