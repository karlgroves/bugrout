/**
 * The request ValhallaModule actually sends keeps exclude_polygons inside the
 * engine's perimeter limit (#168). Checked through calculateRoute() and the
 * body handed to fetch, not the helper in isolation, so the wiring is covered.
 */

import * as AvoidanceBudget from "@/services/routing/AvoidanceBudget";
import { MAX_EXCLUDE_POLYGONS_PERIMETER_M } from "@/services/routing/AvoidanceBudget";
import { ringPerimeterMeters } from "@/services/routing/ringGeometry";
import {
  calculateRoute,
  initValhalla,
} from "@/services/valhalla/ValhallaModule";

import fixture from "./fixtures/valhalla-baltimore-route.json";

import type { GeoJSONPolygon } from "@bugrout/shared";

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
const ANNAPOLIS = { lat: 38.9784, lng: -76.4922 };

/**
 * A fire perimeter: a circle of `radius` meters, jagged so its drawn perimeter
 * is several times the smooth circle's.
 */
function fire(
  radius: number,
  center: { lat: number; lng: number } = { lat: 39.19, lng: -76.57 },
): GeoJSONPolygon {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const ring: number[][] = [];
  for (let i = 0; i < 1000; i++) {
    const theta = (2 * Math.PI * i) / 1000;
    const r = radius + 150 * Math.sin(i * 7.3) * Math.cos(i * 3.1 + 0.5);
    ring.push([
      center.lng + (r * Math.cos(theta)) / (111_320 * cosLat),
      center.lat + (r * Math.sin(theta)) / 111_320,
    ]);
  }
  const [first] = ring;
  if (first) ring.push(first);
  return { type: "Polygon", coordinates: [ring] };
}

const perimeterOf = (polygons: GeoJSONPolygon[]): number =>
  polygons.reduce(
    (sum, p) => sum + ringPerimeterMeters(p.coordinates[0] ?? []),
    0,
  );

describe("ValhallaModule exclude_polygons", () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.EXPO_PUBLIC_VALHALLA_URL;
  let sentBodies: Record<string, unknown>[];

  beforeEach(async () => {
    sentBodies = [];
    process.env.EXPO_PUBLIC_VALHALLA_URL = "https://valhalla.test";
    global.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
      sentBodies.push(
        JSON.parse(init?.body as string) as Record<string, unknown>,
      );
      // A real route, so calculateRoute resolves: these tests read only the
      // request, and a failure no longer falls back to a made-up route (#190).
      return Promise.resolve(
        new Response(JSON.stringify(fixture), { status: 200 }),
      );
    }) as typeof fetch;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await initValhalla({ tileDir: "/tiles", approach: "http" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_VALHALLA_URL;
    else process.env.EXPO_PUBLIC_VALHALLA_URL = originalUrl;
    jest.restoreAllMocks();
  });

  it("sends threat perimeters drawn far over the limit as ones that fit", async () => {
    // Twelve 1.2 km-radius fires along the route: small circles (~7.5 km each
    // when smooth), drawn jagged enough to total well over the limit.
    const fires = Array.from({ length: 12 }, (_, i) =>
      fire(1200, { lat: 38.99 + i * 0.025, lng: -76.5 - i * 0.009 }),
    );
    expect(perimeterOf(fires)).toBeGreaterThan(
      MAX_EXCLUDE_POLYGONS_PERIMETER_M,
    );

    await calculateRoute(BALTIMORE, ANNAPOLIS, { avoidPolygons: fires });

    const excluded = sentBodies[0]?.exclude_polygons as number[][][];
    expect(excluded).toHaveLength(12);
    const total = excluded.reduce((s, r) => s + ringPerimeterMeters(r), 0);
    expect(total).toBeLessThanOrEqual(MAX_EXCLUDE_POLYGONS_PERIMETER_M);
  });

  it("drops a threat that cannot fit even simplified, and says so", async () => {
    // A 50 km-radius fire over the whole trip: clipped to the corridor it is
    // still a ~290 km outline, over the limit however smooth it is.
    await calculateRoute(BALTIMORE, ANNAPOLIS, {
      avoidPolygons: [fire(50_000)],
    });

    expect(sentBodies[0]).not.toHaveProperty("exclude_polygons");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("1 threat polygon(s) exceed"),
    );
  });

  it("still sends the request, without avoidance, if bounding throws", async () => {
    jest
      .spyOn(AvoidanceBudget, "boundAvoidancePolygons")
      .mockImplementation(() => {
        throw new RangeError("Maximum call stack size exceeded");
      });

    await expect(
      calculateRoute(BALTIMORE, ANNAPOLIS, { avoidPolygons: [fire(1200)] }),
    ).resolves.toBeDefined();

    expect(sentBodies).toHaveLength(1);
    expect(sentBodies[0]).not.toHaveProperty("exclude_polygons");
  });

  it("omits exclude_polygons when nothing is left to avoid", async () => {
    const farAway: GeoJSONPolygon = {
      type: "Polygon",
      coordinates: [
        [
          [-75, 40.5],
          [-74.9, 40.5],
          [-74.9, 40.6],
          [-75, 40.6],
          [-75, 40.5],
        ],
      ],
    };

    await calculateRoute(BALTIMORE, ANNAPOLIS, { avoidPolygons: [farAway] });

    expect(sentBodies[0]).not.toHaveProperty("exclude_polygons");
  });
});
