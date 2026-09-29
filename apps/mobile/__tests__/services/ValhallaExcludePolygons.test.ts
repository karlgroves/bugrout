/**
 * The request ValhallaModule actually sends keeps exclude_polygons inside the
 * engine's perimeter limit (#168). Checked through calculateRoute() and the
 * body handed to fetch, not the helper in isolation, so the wiring is covered.
 */
import { ringPerimeterMeters } from "@/services/routing/AvoidanceBudget";
import {
  calculateRoute,
  initValhalla,
} from "@/services/valhalla/ValhallaModule";

import type { GeoJSONPolygon } from "@bugrout/shared";

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
const ANNAPOLIS = { lat: 38.9784, lng: -76.4922 };

/**
 * A fire perimeter on the route: a circle of `radius` meters, jagged so its
 * drawn perimeter is several times the smooth circle's.
 */
function fire(radius: number): GeoJSONPolygon {
  const center = { lat: 39.19, lng: -76.57 };
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
      return Promise.resolve(new Response("{}", { status: 400 }));
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

  it("sends a threat perimeter far over the limit as one that fits", async () => {
    // 1.2 km radius: ~7.5 km smooth, drawn at well over twice the limit.
    const threat = fire(1200);
    expect(ringPerimeterMeters(threat.coordinates[0] ?? [])).toBeGreaterThan(
      20_000,
    );

    await calculateRoute(BALTIMORE, ANNAPOLIS, { avoidPolygons: [threat] });

    const excluded = sentBodies[0]?.exclude_polygons as number[][][];
    expect(excluded).toHaveLength(1);
    const total = excluded.reduce((s, r) => s + ringPerimeterMeters(r), 0);
    expect(total).toBeLessThanOrEqual(10_000);
  });

  it("drops a threat that cannot fit even simplified, and says so", async () => {
    // 2 km radius: the smooth circle alone is ~12.6 km, over the 10 km limit.
    await calculateRoute(BALTIMORE, ANNAPOLIS, {
      avoidPolygons: [fire(2000)],
    });

    expect(sentBodies[0]).not.toHaveProperty("exclude_polygons");
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("1 threat polygon(s) exceed"),
    );
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
