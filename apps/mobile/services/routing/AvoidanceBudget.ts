/**
 * Avoidance Budget
 *
 * Fits threat avoidance polygons inside Valhalla's `exclude_polygons` limit.
 *
 * Valhalla rejects a route request outright — `400 Exceeded maximum
 * circumference for exclude_polygons` — when the TOTAL perimeter of all its
 * exclude polygons exceeds `service_limits.max_exclude_polygons_length`. Real
 * threat geometry (fire perimeters, flood zones) is routinely far past that, so
 * sending it unbounded turned every threatened route into a failure (#168).
 *
 * The budget is spent in order of how little it gives up:
 *
 * 1. **Clip to the trip corridor.** Geometry far from the trip cannot change
 *    the route; only the part within a margin of it is kept.
 * 2. **Simplify.** Douglas-Peucker with an escalating tolerance. Fire perimeters
 *    are highly irregular, so this removes most of their perimeter while moving
 *    the boundary by at most the tolerance.
 * 3. **Prioritise.** If the polygons still do not fit, the ones nearest the trip
 *    are kept and the furthest are dropped. A dropped threat is not ignored: the
 *    route preview tests the final route against every active threat and warns
 *    when it passes through one.
 */

import { expandBBox, pointInPolygon } from "../../utils/geo";

import {
  clipRingToBBox,
  filterBySignificance,
  pointToSegment,
  projector,
  rankVertices,
  ringPerimeterMeters,
  toVertices,
} from "./ringGeometry";

import type { BBox, GeoJSONPolygon, LatLng } from "@bugrout/shared";

/**
 * Total exclude-polygon perimeter the routing engine accepts, in meters.
 *
 * Must match `service_limits.max_exclude_polygons_length` in the Valhalla
 * config the app routes against. 10 000 m is Valhalla's default, which is what
 * `backend/services/valhalla/Dockerfile` builds today.
 */
const MAX_EXCLUDE_POLYGONS_PERIMETER_M = 10_000;

/** How far beyond the trip's bounding box threat geometry is still kept. */
const CORRIDOR_MARGIN_M = 25_000;

/** Douglas-Peucker tolerances tried in turn, in meters. 0 means unsimplified. */
const SIMPLIFY_TOLERANCES_M = [0, 50, 100, 250, 500, 1000] as const;

/**
 *
 */
export interface BoundedAvoidance {
  /** Polygons to send, each a single closed outer ring. */
  polygons: GeoJSONPolygon[];
  /** Total perimeter of `polygons`, in meters. */
  totalPerimeterMeters: number;
  /** Polygons dropped because they would not fit even after simplification. */
  dropped: number;
}

/** A vertex as named longitude/latitude. */
/**
 * Fit avoidance polygons inside the exclude-polygon perimeter budget.
 *
 * @param polygons - Candidate avoidance polygons (outer ring is used).
 * @param tripPoints - Origin, waypoints and destination, in travel order.
 * @param budgetMeters - Total perimeter allowed.
 * @returns The polygons to send, their total perimeter, and how many were
 *   dropped.
 */
export function boundAvoidancePolygons(
  polygons: GeoJSONPolygon[],
  tripPoints: LatLng[],
  budgetMeters: number = MAX_EXCLUDE_POLYGONS_PERIMETER_M,
): BoundedAvoidance {
  const corridor = tripCorridor(tripPoints);
  const clipped = polygons
    .map((p) => p.coordinates[0] ?? [])
    .map((ring) => (corridor ? clipRingToBBox(ring, corridor) : ring))
    .filter((ring) => ring.length >= 4);

  // Rank each ring's vertices once; every tolerance is then a linear filter.
  const ranked = clipped.map((ring) => ({ ring, ranks: rankVertices(ring) }));
  let rings = clipped;
  for (const tolerance of SIMPLIFY_TOLERANCES_M) {
    rings = ranked.map(({ ring, ranks }) =>
      tolerance > 0 && ranks ? filterBySignificance(ranks, tolerance) : ring,
    );
    const total = sumPerimeters(rings);
    if (total <= budgetMeters) {
      return {
        polygons: rings.map(toPolygon),
        totalPerimeterMeters: total,
        dropped: 0,
      };
    }
  }

  // Still over budget at the coarsest tolerance: keep the nearest threats.
  const byDistance = rings
    .map((ring) => ({
      ring,
      perimeter: ringPerimeterMeters(ring),
      distance: distanceToTrip(ring, tripPoints),
    }))
    .sort((a, b) => a.distance - b.distance);

  const kept: number[][][] = [];
  let total = 0;
  for (const { ring, perimeter: ringPerimeter } of byDistance) {
    if (total + ringPerimeter <= budgetMeters) {
      kept.push(ring);
      total += ringPerimeter;
    }
  }

  return {
    polygons: kept.map(toPolygon),
    totalPerimeterMeters: total,
    dropped: rings.length - kept.length,
  };
}

/**
 * The trip's bounding box, expanded by the corridor margin.
 *
 * @param points - Origin, waypoints and destination.
 * @returns The corridor, or `null` when there are no points.
 */
function tripCorridor(points: LatLng[]): BBox | null {
  const [first] = points;
  if (!first) return null;
  const bbox = points.reduce<BBox>(
    (b, p) => ({
      west: Math.min(b.west, p.lng),
      east: Math.max(b.east, p.lng),
      south: Math.min(b.south, p.lat),
      north: Math.max(b.north, p.lat),
    }),
    { west: first.lng, east: first.lng, south: first.lat, north: first.lat },
  );
  return expandBBox(bbox, CORRIDOR_MARGIN_M);
}

/**
 * Distance from a ring to the trip polyline, used to rank threats.
 *
 * @param ring - Closed ring of `[lng, lat]` pairs.
 * @param tripPoints - Origin, waypoints and destination, in travel order.
 * @returns Meters from the nearest ring vertex to the trip polyline; 0 when a
 *   trip point lies inside the ring.
 */
function distanceToTrip(ring: number[][], tripPoints: LatLng[]): number {
  if (tripPoints.some((p) => pointInPolygon([p.lng, p.lat], ring))) return 0;

  const vertices = toVertices(ring);
  const [first] = vertices;
  if (!first) return Infinity;
  const project = projector(first);
  const trip = tripPoints.map(project);
  const segments = trip.slice(1).map((b, i) => [trip.at(i) ?? b, b] as const);

  let best = Infinity;
  for (const vertex of vertices) {
    const v = project(vertex);
    for (const p of trip)
      best = Math.min(best, Math.hypot(v.x - p.x, v.y - p.y));
    for (const [a, b] of segments)
      best = Math.min(best, pointToSegment(v, a, b));
  }
  return best;
}

/**
 * Total perimeter of several rings.
 *
 * @param rings - Rings of `[lng, lat]` pairs.
 * @returns The summed perimeter in meters.
 */
function sumPerimeters(rings: number[][][]): number {
  return rings.reduce((sum, ring) => sum + ringPerimeterMeters(ring), 0);
}

/**
 * Wrap a ring as a GeoJSON polygon.
 *
 * @param ring - Closed ring of `[lng, lat]` pairs.
 * @returns The polygon.
 */
function toPolygon(ring: number[][]): GeoJSONPolygon {
  return { type: "Polygon", coordinates: [ring] };
}
