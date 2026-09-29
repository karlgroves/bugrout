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

import { expandBBox, haversineDistance, pointInPolygon } from "../../utils/geo";

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

const METERS_PER_DEGREE = 111_320;

/** The outcome of fitting avoidance polygons to the budget. */
export interface BoundedAvoidance {
  /** Polygons to send, each a single closed outer ring. */
  polygons: GeoJSONPolygon[];
  /** Total perimeter of `polygons`, in meters. */
  totalPerimeterMeters: number;
  /** Polygons dropped because they would not fit even after simplification. */
  dropped: number;
}

/** A vertex as named longitude/latitude. */
interface Vertex {
  lng: number;
  lat: number;
}

/** A point in a local planar projection, in meters. */
interface XY {
  x: number;
  y: number;
}

/**
 * Perimeter of a ring of `[lng, lat]` pairs, in meters.
 *
 * @param ring - Closed or open ring of `[lng, lat]` pairs.
 * @returns The summed great-circle length of its edges.
 */
export function ringPerimeterMeters(ring: number[][]): number {
  return perimeter(toVertices(ring));
}

/**
 * Clip a ring to an axis-aligned bounding box (Sutherland-Hodgman).
 *
 * @param ring - Closed ring of `[lng, lat]` pairs.
 * @param bbox - The clip box.
 * @returns The clipped closed ring, or `[]` when nothing of it lies inside.
 */
export function clipRingToBBox(ring: number[][], bbox: BBox): number[][] {
  let vertices = openRing(toVertices(ring));
  vertices = clipEdge(
    vertices,
    (v) => v.lng >= bbox.west,
    (a, b) => atLng(a, b, bbox.west),
  );
  vertices = clipEdge(
    vertices,
    (v) => v.lng <= bbox.east,
    (a, b) => atLng(a, b, bbox.east),
  );
  vertices = clipEdge(
    vertices,
    (v) => v.lat >= bbox.south,
    (a, b) => atLat(a, b, bbox.south),
  );
  vertices = clipEdge(
    vertices,
    (v) => v.lat <= bbox.north,
    (a, b) => atLat(a, b, bbox.north),
  );
  return vertices.length >= 3 ? fromVertices(closeRing(vertices)) : [];
}

/**
 * Douglas-Peucker simplification of a closed ring.
 *
 * Kept vertices are a subset of the input, and every dropped vertex lies within
 * `toleranceMeters` of the simplified boundary.
 *
 * @param ring - Closed ring of `[lng, lat]` pairs.
 * @param toleranceMeters - Maximum distance a dropped vertex may lie from the
 *   simplified boundary.
 * @returns The simplified closed ring; the input when simplifying would leave
 *   fewer than three distinct vertices.
 */
export function simplifyRing(
  ring: number[][],
  toleranceMeters: number,
): number[][] {
  const open = openRing(toVertices(ring));
  const [first] = open;
  if (toleranceMeters <= 0 || open.length <= 3 || !first) return ring;

  const project = projector(first);
  const points = open.map(project);
  const start = project(first);

  // Split the ring at its first vertex and the vertex farthest from it, so the
  // two halves are open polylines Douglas-Peucker can work on.
  let farIndex = 0;
  let farDistance = -1;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - start.x, p.y - start.y);
    if (d > farDistance) {
      farDistance = d;
      farIndex = i;
    }
  });
  if (farIndex === 0) return ring;

  // The closing vertex of the ring is the first one again.
  const closed = [...points, start];
  const keep = new Set<number>([0, farIndex]);
  douglasPeucker(
    { points: closed, tolerance: toleranceMeters, keep },
    0,
    farIndex,
  );
  douglasPeucker(
    { points: closed, tolerance: toleranceMeters, keep },
    farIndex,
    open.length,
  );

  const kept = open.filter((_, i) => keep.has(i));
  return kept.length >= 3 ? fromVertices(closeRing(kept)) : ring;
}

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

  let rings = clipped;
  for (const tolerance of SIMPLIFY_TOLERANCES_M) {
    rings = clipped.map((ring) => simplifyRing(ring, tolerance));
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
  const ranked = rings
    .map((ring) => ({
      ring,
      perimeter: ringPerimeterMeters(ring),
      distance: distanceToTrip(ring, tripPoints),
    }))
    .sort((a, b) => a.distance - b.distance);

  const kept: number[][][] = [];
  let total = 0;
  for (const { ring, perimeter: ringPerimeter } of ranked) {
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
 * Local equirectangular projection to meters, centred on `origin`.
 *
 * @param origin - The projection centre.
 * @returns A function projecting a vertex to planar meters.
 */
function projector(origin: Vertex): (v: Vertex) => XY {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  return (v) => ({
    x: (v.lng - origin.lng) * METERS_PER_DEGREE * cosLat,
    y: (v.lat - origin.lat) * METERS_PER_DEGREE,
  });
}

/** State shared by one Douglas-Peucker pass. */
interface SimplifyPass {
  /** Projected ring, with the closing vertex repeated at the end. */
  points: XY[];
  tolerance: number;
  /** Indices of vertices to keep. */
  keep: Set<number>;
}

/**
 * Recursive Douglas-Peucker step over `points[first..last]`.
 *
 * @param pass - The shared pass state; kept indices are added to `pass.keep`.
 * @param first - Index of the span's first vertex.
 * @param last - Index of the span's last vertex.
 */
function douglasPeucker(pass: SimplifyPass, first: number, last: number): void {
  const start = pass.points.at(first);
  const end = pass.points.at(last);
  if (!start || !end || last - first < 2) return;

  let maxDistance = -1;
  let maxIndex = first;
  pass.points.slice(first + 1, last).forEach((p, offset) => {
    const d = pointToSegment(p, start, end);
    if (d > maxDistance) {
      maxDistance = d;
      maxIndex = first + 1 + offset;
    }
  });

  if (maxDistance > pass.tolerance) {
    pass.keep.add(maxIndex);
    douglasPeucker(pass, first, maxIndex);
    douglasPeucker(pass, maxIndex, last);
  }
}

/**
 * Planar distance from a point to a segment.
 *
 * @param p - The point.
 * @param a - Segment start.
 * @param b - Segment end.
 * @returns The distance, in the projection's units.
 */
function pointToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq),
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * One Sutherland-Hodgman pass against a single clip edge.
 *
 * @param vertices - Open ring.
 * @param inside - Whether a vertex is on the kept side of the edge.
 * @param intersect - Where segment `a`-`b` crosses the edge.
 * @returns The clipped open ring.
 */
function clipEdge(
  vertices: Vertex[],
  inside: (v: Vertex) => boolean,
  intersect: (a: Vertex, b: Vertex) => Vertex,
): Vertex[] {
  const output: Vertex[] = [];
  let previous = vertices.at(-1);
  for (const current of vertices) {
    if (previous && inside(current) !== inside(previous)) {
      output.push(intersect(previous, current));
    }
    if (inside(current)) output.push(current);
    previous = current;
  }
  return output;
}

/**
 * The point where segment `a`-`b` crosses a meridian.
 *
 * @param a - Segment start.
 * @param b - Segment end.
 * @param lng - The meridian.
 * @returns The crossing vertex.
 */
function atLng(a: Vertex, b: Vertex, lng: number): Vertex {
  const t = (lng - a.lng) / (b.lng - a.lng);
  return { lng, lat: a.lat + t * (b.lat - a.lat) };
}

/**
 * The point where segment `a`-`b` crosses a parallel.
 *
 * @param a - Segment start.
 * @param b - Segment end.
 * @param lat - The parallel.
 * @returns The crossing vertex.
 */
function atLat(a: Vertex, b: Vertex, lat: number): Vertex {
  const t = (lat - a.lat) / (b.lat - a.lat);
  return { lng: a.lng + t * (b.lng - a.lng), lat };
}

/**
 * Great-circle perimeter of a vertex sequence.
 *
 * @param vertices - The ring, closed or open.
 * @returns The summed edge length in meters.
 */
function perimeter(vertices: Vertex[]): number {
  let total = 0;
  let previous: Vertex | undefined;
  for (const v of vertices) {
    if (previous) total += haversineDistance(previous, v);
    previous = v;
  }
  return total;
}

/**
 * Drop the closing vertex of a closed ring.
 *
 * @param vertices - A ring, closed or open.
 * @returns The open ring.
 */
function openRing(vertices: Vertex[]): Vertex[] {
  const first = vertices.at(0);
  const last = vertices.at(-1);
  if (vertices.length < 2 || !first || !last) return vertices;
  const closed = first.lng === last.lng && first.lat === last.lat;
  return closed ? vertices.slice(0, -1) : vertices;
}

/**
 * Close an open ring by repeating its first vertex.
 *
 * @param vertices - An open ring.
 * @returns The closed ring.
 */
function closeRing(vertices: Vertex[]): Vertex[] {
  const first = vertices.at(0);
  return first ? [...vertices, first] : vertices;
}

/**
 * Convert `[lng, lat]` pairs to vertices.
 *
 * @param ring - Coordinate pairs.
 * @returns The vertices; malformed pairs are skipped.
 */
function toVertices(ring: number[][]): Vertex[] {
  const vertices: Vertex[] = [];
  for (const [lng, lat] of ring) {
    if (lng !== undefined && lat !== undefined) vertices.push({ lng, lat });
  }
  return vertices;
}

/**
 * Convert vertices back to `[lng, lat]` pairs.
 *
 * @param vertices - The vertices.
 * @returns Coordinate pairs.
 */
function fromVertices(vertices: Vertex[]): number[][] {
  return vertices.map((v) => [v.lng, v.lat]);
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
