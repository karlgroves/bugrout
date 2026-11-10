/**
 * Malformed upstream threat geometry (#287).
 *
 * One `null` or non-numeric coordinate in a fire perimeter used to reshape its
 * avoidance zone into a band across the route, or drop it from the request
 * altogether, and a `null` geometry threw from route calculation and the route
 * preview. Every threat source is untrusted JSON, so the geometry is validated
 * at ingest, on the way out of the cache, and again where it is used.
 */

import { DatabaseSync } from "node:sqlite";

import { getCachedThreats } from "@/db/queries/threats";
import { CREATE_TABLES_SQL } from "@/db/schema";
import { boundAvoidancePolygons } from "@/services/routing/AvoidanceBudget";
import {
  routeIntersectsThreat,
  threatsToAvoidancePolygons,
} from "@/services/routing/ThreatAvoidance";
import { parseFloodFeatures } from "@/services/threats/FEMAService";
import { fetchFirePerimeters } from "@/services/threats/USFSService";
import {
  isValidRing,
  sanitizeThreatGeometry,
  withUsableGeometry,
} from "@/utils/geo";

import type { SQLiteDatabase } from "@/platform/sqlite";
import type { ThreatZone } from "@bugrout/shared";

type SqlParam = string | number | null;

let mockDb: SQLiteDatabase;

jest.mock("@/db/database", () => ({
  getDatabase: () => Promise.resolve(mockDb),
}));

/** The app's database interface over an in-memory node:sqlite database. */
function openTestDatabase(): SQLiteDatabase {
  const raw = new DatabaseSync(":memory:");
  return {
    execAsync: (sql) => {
      raw.exec(sql);
      return Promise.resolve();
    },
    runAsync: (sql, ...params) => {
      const result = raw.prepare(sql).run(...(params as SqlParam[]));
      return Promise.resolve({ changes: Number(result.changes) });
    },
    getAllAsync: <T>(sql: string, ...params: unknown[]) =>
      Promise.resolve(raw.prepare(sql).all(...(params as SqlParam[])) as T[]),
    getFirstAsync: <T>(sql: string, ...params: unknown[]) =>
      Promise.resolve(
        (raw.prepare(sql).get(...(params as SqlParam[])) as T | undefined) ??
          null,
      ),
    closeAsync: () => {
      raw.close();
      return Promise.resolve();
    },
  };
}

// A ~2 km square fire between the trip's origin and destination.
const FIRE: number[][] = [
  [-76.72, 39.37],
  [-76.72, 39.39],
  [-76.7, 39.39],
  [-76.7, 39.37],
  [-76.72, 39.37],
];
const TRIP = [
  { lat: 39.29, lng: -76.61 },
  { lat: 39.45, lng: -76.8 },
];

/** FIRE with its second vertex's longitude replaced. */
function fireWithLng(lng: unknown): number[][] {
  const ring = FIRE.map((p) => [...p]);
  (ring[1] as unknown[])[0] = lng;
  return ring;
}

/** A wildfire zone with the given (possibly malformed) geometry. */
function fire(geometry: unknown, id = "fire"): ThreatZone {
  return {
    id,
    type: "wildfire",
    severity: "severe",
    geometry: geometry as ThreatZone["geometry"],
    headline: "Fire",
    description: "",
    source: "usfs",
    fetchedAt: 0,
    expiresAt: null,
  };
}

const polygon = (ring: unknown) => ({ type: "Polygon", coordinates: [ring] });

describe("isValidRing", () => {
  it("accepts a closed ring of finite, in-range positions", () => {
    expect(isValidRing(FIRE)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "x"],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["out of range", 200],
  ])("rejects a ring with a %s coordinate", (_label, value) => {
    expect(isValidRing(fireWithLng(value))).toBe(false);
  });

  it("rejects a ring with fewer than four positions", () => {
    expect(isValidRing(FIRE.slice(0, 3))).toBe(false);
  });
});

describe("sanitizeThreatGeometry", () => {
  it("returns a valid geometry unchanged", () => {
    const g = polygon(FIRE);
    expect(sanitizeThreatGeometry(g)).toBe(g);
  });

  it.each([null, undefined, {}, { type: "Point", coordinates: [0, 0] }])(
    "rejects %p",
    (g) => {
      expect(sanitizeThreatGeometry(g)).toBeNull();
    },
  );

  it("keeps a Polygon's outer ring when only a hole is malformed", () => {
    expect(
      sanitizeThreatGeometry({
        type: "Polygon",
        coordinates: [FIRE, fireWithLng(null)],
      }),
    ).toEqual(polygon(FIRE));
  });

  it("rejects a Polygon whose outer ring is malformed", () => {
    expect(
      sanitizeThreatGeometry({
        type: "Polygon",
        coordinates: [fireWithLng(null), FIRE],
      }),
    ).toBeNull();
  });

  it("drops a malformed hole from a MultiPolygon part", () => {
    expect(
      sanitizeThreatGeometry({
        type: "MultiPolygon",
        coordinates: [[FIRE, fireWithLng("x")]],
      }),
    ).toEqual({ type: "MultiPolygon", coordinates: [[FIRE]] });
  });

  it("keeps the usable parts of a MultiPolygon", () => {
    expect(
      sanitizeThreatGeometry({
        type: "MultiPolygon",
        coordinates: [[fireWithLng("x")], [FIRE]],
      }),
    ).toEqual({ type: "MultiPolygon", coordinates: [[FIRE]] });
  });
});

describe("threatsToAvoidancePolygons with malformed geometry", () => {
  it.each([
    ["null", null],
    ["a string", "x"],
  ])(
    "drops a perimeter with a %s coordinate rather than reshaping it",
    (_label, value) => {
      const bad = fire(polygon(fireWithLng(value)), "bad");
      const good = fire(polygon(FIRE), "good");

      const polygons = threatsToAvoidancePolygons([bad, good]);
      expect(polygons).toEqual([{ type: "Polygon", coordinates: [FIRE] }]);

      // The polygon that reaches the router keeps the fire's real ~7.9 km
      // perimeter, not the ~73 km band a null vertex used to produce.
      const bounded = boundAvoidancePolygons(polygons, TRIP);
      expect(bounded.dropped).toBe(0);
      expect(bounded.totalPerimeterMeters).toBeLessThan(10_000);
    },
  );

  it("does not throw on a null geometry", () => {
    expect(threatsToAvoidancePolygons([fire(null)])).toEqual([]);
  });
});

describe("routeIntersectsThreat with malformed geometry", () => {
  const farAway = [{ lat: 36, lng: -120 }];

  it("warns (fails safe) when the geometry is null", () => {
    expect(routeIntersectsThreat(farAway, fire(null))).toBe(true);
  });

  it("tests the outer ring when only a hole is malformed", () => {
    const g = { type: "Polygon", coordinates: [FIRE, fireWithLng(null)] };
    expect(routeIntersectsThreat(farAway, fire(g))).toBe(false);
  });

  it("warns when one MultiPolygon part is unreadable", () => {
    const g = {
      type: "MultiPolygon",
      coordinates: [[FIRE], [fireWithLng("x")]],
    };
    expect(routeIntersectsThreat(farAway, fire(g))).toBe(true);
  });

  it("warns when a coordinate is not a number", () => {
    expect(
      routeIntersectsThreat(farAway, fire(polygon(fireWithLng(NaN)))),
    ).toBe(true);
  });

  it("still reports a clean geometry the route misses as clear", () => {
    expect(routeIntersectsThreat(farAway, fire(polygon(FIRE)))).toBe(false);
  });
});

describe("ingest", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetchFirePerimeters drops perimeters with unusable geometry", async () => {
    const features = [
      { properties: { poly_IncidentName: "Null" }, geometry: null },
      {
        properties: { poly_IncidentName: "Bad" },
        geometry: polygon(fireWithLng(null)),
      },
      { properties: { poly_IncidentName: "Good" }, geometry: polygon(FIRE) },
    ];
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ features }),
      } as Response),
    );

    const threats = await fetchFirePerimeters();
    // Ids are per feature since #291, so identify the survivor by its headline.
    expect(threats.map((t) => t.headline)).toEqual(["Active Fire: Good"]);
  });

  it("parseFloodFeatures drops zones with unusable geometry", () => {
    const zone = (geometry: unknown) => ({
      type: "Feature" as const,
      properties: { FLD_ZONE: "AE" },
      geometry: geometry as ThreatZone["geometry"],
    });
    const threats = parseFloodFeatures(
      [zone(null), zone(polygon(fireWithLng("x"))), zone(polygon(FIRE))],
      "md",
    );
    expect(threats).toHaveLength(1);
    expect(threats[0]?.geometry).toEqual(polygon(FIRE));
  });

  it("withUsableGeometry keeps a valid zone as the same object", () => {
    const good = fire(polygon(FIRE));
    expect(withUsableGeometry([good])[0]).toBe(good);
  });
});

describe("getCachedThreats", () => {
  beforeEach(async () => {
    mockDb = openTestDatabase();
    await mockDb.execAsync(CREATE_TABLES_SQL);
  });

  afterEach(async () => {
    await mockDb.closeAsync();
  });

  it("skips rows an older build cached with unusable geometry", async () => {
    const insert = (id: string, geometry: string) =>
      mockDb.runAsync(
        `INSERT INTO threat_zones
         (id, type, severity, geometry, headline, description, source, fetched_at, expires_at)
         VALUES (?, 'wildfire', 'severe', ?, 'h', 'd', 'usfs', 0, NULL)`,
        id,
        geometry,
      );
    await insert("null", "null");
    await insert("garbage", "{not json");
    await insert("bad", JSON.stringify(polygon(fireWithLng(null))));
    await insert("good", JSON.stringify(polygon(FIRE)));

    const threats = await getCachedThreats();
    expect(threats.map((t) => t.id)).toEqual(["good"]);
  });
});
