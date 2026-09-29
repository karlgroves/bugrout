import { boundAvoidancePolygons } from "@/services/routing/AvoidanceBudget";
import {
  clipRingToBBox,
  ringPerimeterMeters,
  simplifyRing,
  thinVertices,
} from "@/services/routing/ringGeometry";
import { pointInPolygon } from "@/utils/geo";

import type { GeoJSONPolygon, LatLng } from "@bugrout/shared";

// Baltimore -> Annapolis, the route used to verify the live service (#167).
const BALTIMORE: LatLng = { lat: 39.2904, lng: -76.6122 };
const ANNAPOLIS: LatLng = { lat: 38.9784, lng: -76.4922 };
const TRIP = [BALTIMORE, ANNAPOLIS];

const METERS_PER_DEG_LAT = 111_320;

/** A closed square ring of `sideMeters`, centred on `center`. */
function square(center: LatLng, sideMeters: number): number[][] {
  const dLat = sideMeters / 2 / METERS_PER_DEG_LAT;
  const dLng =
    sideMeters /
    2 /
    (METERS_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180));
  return [
    [center.lng - dLng, center.lat - dLat],
    [center.lng + dLng, center.lat - dLat],
    [center.lng + dLng, center.lat + dLat],
    [center.lng - dLng, center.lat + dLat],
    [center.lng - dLng, center.lat - dLat],
  ];
}

/**
 * A closed, deterministic, fire-perimeter-like ring: a circle of `radiusMeters`
 * whose radius wobbles by up to `jitterMeters` over `vertices` points.
 */
function jaggedRing(
  center: LatLng,
  radiusMeters: number,
  jitterMeters: number,
  vertices: number,
): number[][] {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const ring: number[][] = [];
  for (let i = 0; i < vertices; i++) {
    const theta = (2 * Math.PI * i) / vertices;
    const r =
      radiusMeters + jitterMeters * Math.sin(i * 7.3) * Math.cos(i * 3.1 + 0.5);
    ring.push([
      center.lng + (r * Math.cos(theta)) / (METERS_PER_DEG_LAT * cosLat),
      center.lat + (r * Math.sin(theta)) / METERS_PER_DEG_LAT,
    ]);
  }
  const [first] = ring;
  if (first) ring.push(first);
  return ring;
}

const polygon = (ring: number[][]): GeoJSONPolygon => ({
  type: "Polygon",
  coordinates: [ring],
});

const totalPerimeter = (polygons: GeoJSONPolygon[]): number =>
  polygons.reduce(
    (sum, p) => sum + ringPerimeterMeters(p.coordinates[0] ?? []),
    0,
  );

// A point on the trip, roughly a third of the way to Annapolis.
const ON_ROUTE: LatLng = { lat: 39.19, lng: -76.57 };

describe("ringPerimeterMeters", () => {
  it("measures a 1 km square as about 4 km", () => {
    expect(ringPerimeterMeters(square(ON_ROUTE, 1000))).toBeCloseTo(4000, -1);
  });
});

describe("clipRingToBBox", () => {
  const bbox = { west: -76.6, east: -76.5, south: 39.1, north: 39.2 };

  it("keeps only the part inside the box", () => {
    const straddling = square({ lat: 39.2, lng: -76.55 }, 8000);
    const clipped = clipRingToBBox(straddling, bbox);

    expect(clipped.length).toBeGreaterThanOrEqual(4);
    for (const [lng, lat] of clipped) {
      expect(lng).toBeGreaterThanOrEqual(bbox.west - 1e-9);
      expect(lng).toBeLessThanOrEqual(bbox.east + 1e-9);
      expect(lat).toBeGreaterThanOrEqual(bbox.south - 1e-9);
      expect(lat).toBeLessThanOrEqual(bbox.north + 1e-9);
    }
    expect(clipped[0]).toEqual(clipped[clipped.length - 1]);
    expect(ringPerimeterMeters(clipped)).toBeLessThan(
      ringPerimeterMeters(straddling),
    );
  });

  it("returns an empty ring when the polygon is entirely outside", () => {
    expect(clipRingToBBox(square({ lat: 40.5, lng: -75 }, 2000), bbox)).toEqual(
      [],
    );
  });
});

describe("simplifyRing", () => {
  const fire = jaggedRing(ON_ROUTE, 3000, 250, 720);

  it("reduces an irregular perimeter to its underlying shape using a subset of its vertices", () => {
    // Jitter of up to 250 m inflates a 3 km-radius circle (~18.8 km) to ~133 km.
    // At twice the jitter, the simplified ring is back near the circle.
    const simplified = simplifyRing(fire, 500);
    const circle = 2 * Math.PI * 3000;

    expect(ringPerimeterMeters(fire)).toBeGreaterThan(circle * 5);
    expect(ringPerimeterMeters(simplified)).toBeLessThan(circle * 1.1);
    expect(ringPerimeterMeters(simplified)).toBeGreaterThan(circle * 0.8);
    const original = new Set(fire.map((p) => p.join(",")));
    for (const p of simplified) expect(original.has(p.join(","))).toBe(true);
    expect(simplified[0]).toEqual(simplified[simplified.length - 1]);
  });

  it("returns the ring unchanged at zero tolerance", () => {
    expect(simplifyRing(fire, 0)).toBe(fire);
  });

  it("handles an adversarial 100 000-vertex ring without overflowing the stack", () => {
    // Every vertex is the farthest from the previous chord: recursive
    // Douglas-Peucker overflowed the call stack at 10 000 vertices, and an
    // uncapped iterative one takes seconds per pass on the JS thread.
    const comb: number[][] = [];
    for (let i = 0; i < 100_000; i++) {
      comb.push([
        ON_ROUTE.lng + i * 1e-5,
        ON_ROUTE.lat + (i % 2 ? 0.02 : 0) + i * 1e-7,
      ]);
    }
    comb.push([ON_ROUTE.lng + 1, ON_ROUTE.lat - 0.05]);
    const [first] = comb;
    if (first) comb.push(first);

    const simplified = simplifyRing(comb, 50);
    expect(simplified.length).toBeGreaterThanOrEqual(4);
    expect(simplified.length).toBeLessThanOrEqual(2001);
  });

  it("never collapses a small ring below a triangle", () => {
    const tiny = square(ON_ROUTE, 50);
    expect(simplifyRing(tiny, 1000).length).toBeGreaterThanOrEqual(4);
  });
});

describe("thinVertices", () => {
  const dense = Array.from({ length: 100_000 }, (_, i) => ({
    lng: ON_ROUTE.lng + i * 1e-4, // ~8.6 m apart
    lat: ON_ROUTE.lat + (i % 2 ? 0.02 : 0),
  }));

  it("caps what Douglas-Peucker has to rank, keeping a subset in order", () => {
    const thinned = thinVertices(dense);

    expect(thinned.length).toBeLessThanOrEqual(2000);
    let last = -1;
    for (const v of thinned) {
      const index = dense.indexOf(v);
      expect(index).toBeGreaterThan(last);
      last = index;
    }
  });

  it("drops vertices closer than 10 m to the previous one", () => {
    const close = [
      { lng: -76.6, lat: 39.1 },
      { lng: -76.6, lat: 39.10005 }, // ~5.6 m north
      { lng: -76.6, lat: 39.1002 }, // ~22 m north
    ];
    expect(thinVertices(close)).toEqual([close[0], close[2]]);
  });
});

describe("boundAvoidancePolygons", () => {
  it("passes polygons that already fit through unchanged", () => {
    const small = polygon(square(ON_ROUTE, 1000));
    const result = boundAvoidancePolygons([small], TRIP, 10_000);

    expect(result.dropped).toBe(0);
    expect(result.polygons).toEqual([small]);
  });

  it("simplifies an irregular fire perimeter until it fits, without losing it", () => {
    // ~31 km of perimeter as drawn: three times the budget.
    const fire = jaggedRing(ON_ROUTE, 1400, 120, 1440);
    expect(ringPerimeterMeters(fire)).toBeGreaterThan(30_000);

    const result = boundAvoidancePolygons([polygon(fire)], TRIP, 10_000);

    expect(result.dropped).toBe(0);
    expect(result.polygons).toHaveLength(1);
    expect(result.totalPerimeterMeters).toBeLessThanOrEqual(10_000);
    // The fire's centre is still inside what is avoided.
    const ring = result.polygons[0]?.coordinates[0] ?? [];
    expect(pointInPolygon([ON_ROUTE.lng, ON_ROUTE.lat], ring)).toBe(true);
  });

  it("clips away geometry far from the trip", () => {
    const farAway = polygon(square({ lat: 40.5, lng: -75 }, 2000));
    const result = boundAvoidancePolygons([farAway], TRIP, 10_000);

    expect(result.polygons).toEqual([]);
    expect(result.dropped).toBe(0);
  });

  it("keeps the threats nearest the trip when they cannot all fit", () => {
    const near = polygon(square(ON_ROUTE, 5000)); // ~20 km, on the route
    const far = polygon(square({ lat: 39.25, lng: -76.9 }, 5000)); // ~20 km, 25 km west
    const result = boundAvoidancePolygons([far, near], TRIP, 25_000);

    expect(result.dropped).toBe(1);
    expect(result.polygons).toHaveLength(1);
    const kept = result.polygons[0]?.coordinates[0] ?? [];
    expect(pointInPolygon([ON_ROUTE.lng, ON_ROUTE.lat], kept)).toBe(true);
  });

  it("never exceeds the budget, whatever it is given", () => {
    // A county-sized flood zone over the whole trip, plus scattered fires.
    const county = polygon(square(ON_ROUTE, 60_000));
    const fires = [0, 1, 2, 3].map((i) =>
      polygon(
        jaggedRing(
          { lat: 39.0 + i * 0.08, lng: -76.55 - i * 0.02 },
          900,
          100,
          600,
        ),
      ),
    );

    for (const budget of [5_000, 10_000, 50_000]) {
      const result = boundAvoidancePolygons([county, ...fires], TRIP, budget);
      expect(totalPerimeter(result.polygons)).toBeLessThanOrEqual(budget);
      expect(result.totalPerimeterMeters).toBeCloseTo(
        totalPerimeter(result.polygons),
      );
    }
  });
});
