/**
 * Upstream threat feeds are bounded before they reach SQLite and routing
 * (#305): body size, feature count and headline length, batched writes, and no
 * unthinned ring carried into the avoidance request.
 */

import { DatabaseSync } from "node:sqlite";

import { getCachedThreats, upsertThreatZones } from "@/db/queries/threats";
import { CREATE_TABLES_SQL } from "@/db/schema";
import { boundAvoidancePolygons } from "@/services/routing/AvoidanceBudget";
import { parseNWSResponse } from "@/services/threats/NWSService";
import {
  fetchFirePerimeters,
  nifcQueryUrl,
} from "@/services/threats/USFSService";
import {
  MAX_FEED_FEATURES,
  MAX_HEADLINE_CHARS,
  readJsonBounded,
} from "@/utils/feedBounds";

import type { SQLiteDatabase } from "@/platform/sqlite";
import type { BBox, LatLng, ThreatZone } from "@bugrout/shared";

type SqlParam = string | number | null;

let raw: DatabaseSync;
let mockDb: SQLiteDatabase;

jest.mock("@/db/database", () => ({
  getDatabase: () => Promise.resolve(mockDb),
}));

const MARYLAND: BBox = { west: -79.5, south: 37.9, east: -75.0, north: 39.8 };

const SQUARE = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-76.6, 39.2],
      [-76.5, 39.2],
      [-76.5, 39.3],
      [-76.6, 39.3],
      [-76.6, 39.2],
    ],
  ],
};

/** A fake fetch Response carrying `body`, declaring `declared` bytes. */
function response(body: string, declared?: number): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-length" && declared !== undefined
          ? String(declared)
          : null,
    },
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

/** An NWS alert feature with the given headline. */
function nwsFeature(id: string, headline: string) {
  return {
    properties: { id, event: "Flood Warning", headline },
    geometry: SQUARE,
  };
}

/** A NIFC perimeter feature with the given incident name. */
function nifcFeature(name: string) {
  return {
    properties: { poly_IncidentName: name, irwin_PercentContained: 10 },
    geometry: SQUARE,
  };
}

/** A cached threat zone with the given id. */
function threat(id: string): ThreatZone {
  return {
    id,
    type: "wildfire",
    severity: "severe",
    geometry: SQUARE,
    headline: `Active Fire: ${id}`,
    description: "10% contained",
    source: "usfs",
    fetchedAt: 1,
    expiresAt: null,
  };
}

describe("readJsonBounded", () => {
  it("parses a body within the limit", async () => {
    await expect(readJsonBounded(response('{"a":1}'), 100)).resolves.toEqual({
      a: 1,
    });
  });

  it("refuses a body whose declared length is over the limit", async () => {
    await expect(readJsonBounded(response("{}", 101), 100)).rejects.toThrow(
      /too large/,
    );
  });

  it("refuses a body that is over the limit whatever it declares", async () => {
    const body = JSON.stringify({ pad: "x".repeat(200) });
    await expect(readJsonBounded(response(body, 10), 100)).rejects.toThrow(
      /too large/,
    );
  });
});

describe("NWS alerts", () => {
  it("caps a stored headline", () => {
    const [alert] = parseNWSResponse({
      features: [nwsFeature("a1", "H".repeat(1_000_000))],
    });
    expect(alert?.headline.length).toBe(MAX_HEADLINE_CHARS);
    expect(alert?.headline.endsWith("…")).toBe(true);
  });

  it("keeps a real-length headline whole", () => {
    const headline =
      "Red Flag Warning issued November 8 at 3:12AM PST until November 9 at 6:00PM PST by NWS Los Angeles/Oxnard CA";
    const [alert] = parseNWSResponse({
      features: [nwsFeature("a1", headline)],
    });
    expect(alert?.headline).toBe(headline);
  });

  it("refuses a response with more alerts than the cap, rather than dropping some", () => {
    const features = Array.from({ length: MAX_FEED_FEATURES + 1 }, (_, i) =>
      nwsFeature(`a${String(i)}`, "Flood Warning"),
    );
    expect(() => parseNWSResponse({ features })).toThrow(/exceeds/);
  });
});

describe("NIFC fire perimeters", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("asks only for the perimeters inside the region", () => {
    const url = new URL(nifcQueryUrl(MARYLAND));
    expect(url.searchParams.get("geometry")).toBe("-79.5,37.9,-75,39.8");
    expect(url.searchParams.get("geometryType")).toBe("esriGeometryEnvelope");
    expect(url.searchParams.get("inSR")).toBe("4326");
  });

  it("caps the incident name in the headline and the id", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve(
        response(JSON.stringify({ features: [nifcFeature("N".repeat(5000))] })),
      ),
    ) as typeof fetch;

    const [fire] = await fetchFirePerimeters(MARYLAND);
    expect(fire?.headline.length).toBeLessThanOrEqual(
      "Active Fire: ".length + MAX_HEADLINE_CHARS,
    );
    expect(fire?.id.length).toBeLessThanOrEqual(
      "fire-".length + MAX_HEADLINE_CHARS,
    );
  });

  it("refuses a response with more perimeters than the cap", async () => {
    const features = Array.from({ length: MAX_FEED_FEATURES + 1 }, (_, i) =>
      nifcFeature(`Fire ${String(i)}`),
    );
    global.fetch = jest.fn(() =>
      Promise.resolve(response(JSON.stringify({ features }))),
    ) as typeof fetch;

    await expect(fetchFirePerimeters(MARYLAND)).rejects.toThrow(/exceeds/);
  });
});

describe("upsertThreatZones", () => {
  beforeEach(async () => {
    raw = new DatabaseSync(":memory:");
    const runAsync = jest.fn((sql: string, ...params: unknown[]) => {
      const result = raw.prepare(sql).run(...(params as SqlParam[]));
      return Promise.resolve({ changes: Number(result.changes) });
    });
    mockDb = {
      execAsync: (sql: string) => {
        raw.exec(sql);
        return Promise.resolve();
      },
      runAsync,
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
    await mockDb.execAsync(CREATE_TABLES_SQL);
  });

  afterEach(async () => {
    await mockDb.closeAsync();
  });

  it("writes a large feed in a few statements, not one per zone", async () => {
    const threats = Array.from({ length: 250 }, (_, i) =>
      threat(`fire-${String(i)}`),
    );
    await upsertThreatZones(threats);

    expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
    const cached = await getCachedThreats("usfs");
    expect(cached).toHaveLength(250);
    expect(cached.find((t) => t.id === "fire-249")).toEqual(threat("fire-249"));
  });

  it("replaces a zone with the same id", async () => {
    await upsertThreatZones([threat("fire-1")]);
    await upsertThreatZones([{ ...threat("fire-1"), description: "updated" }]);

    const cached = await getCachedThreats();
    expect(cached).toHaveLength(1);
    expect(cached[0]?.description).toBe("updated");
  });
});

describe("boundAvoidancePolygons with clustered vertices", () => {
  const BALTIMORE: LatLng = { lat: 39.2904, lng: -76.6122 };
  const ANNAPOLIS: LatLng = { lat: 38.9784, lng: -76.4922 };

  it("does not send a ring's unthinned vertices when thinning leaves too few to rank", () => {
    // A triangle whose every corner is a cluster of near-identical points:
    // thinning keeps one point per corner, which is too few to rank.
    const corners = [
      [-76.6, 39.1],
      [-76.5, 39.1],
      [-76.55, 39.2],
    ];
    const ring: number[][] = corners.flatMap(([lng = 0, lat = 0]) =>
      Array.from({ length: 10_000 }, (_, i) => [lng + i * 1e-9, lat]),
    );
    ring.push(ring[0] ?? []);

    const { polygons } = boundAvoidancePolygons(
      [{ type: "Polygon", coordinates: [ring] }],
      [BALTIMORE, ANNAPOLIS],
    );

    expect(polygons).toHaveLength(1);
    expect(polygons[0]?.coordinates[0]).toHaveLength(4);
  });
});
