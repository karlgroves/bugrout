/**
 * Ring geometry for threat avoidance polygons.
 *
 * Pure operations on rings of `[lng, lat]` pairs: conversion, a local planar
 * projection, clipping to a box, perimeter, and Douglas-Peucker simplification.
 * `AvoidanceBudget` composes them to fit polygons inside the routing engine's
 * exclude_polygons limit.
 */

import { haversineDistance } from "../../utils/geo";

import type { BBox } from "@bugrout/shared";

const METERS_PER_DEGREE = 111_320;

/**
 * Vertices closer than this to the previous kept vertex are dropped before
 * ranking. Real perimeters are dense; this bounds the moved boundary to 10 m.
 */
const MIN_VERTEX_SPACING_M = 10;

/**
 * Douglas-Peucker is quadratic in the worst case, and this runs on the JS
 * thread. Past this many vertices (after spacing), a ring is evenly sampled.
 */
const MAX_RANKED_VERTICES = 2000;

/** The outcome of fitting avoidance polygons to the budget. */

/**
 *
 */
export interface Vertex {
  lng: number;
  lat: number;
}

/** A point in a local planar projection, in meters. */

/**
 *
 */
export interface XY {
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
 * @returns The simplified closed ring; the input when it has three vertices or
 *   fewer.
 */
export function simplifyRing(
  ring: number[][],
  toleranceMeters: number,
): number[][] {
  if (toleranceMeters <= 0) return ring;
  const ranked = rankVertices(ring);
  return ranked ? filterBySignificance(ranked, toleranceMeters) : ring;
}

/**
 * Local equirectangular projection to meters, centred on `origin`.
 *
 * @param origin - The projection centre.
 * @returns A function projecting a vertex to planar meters.
 */
export function projector(origin: Vertex): (v: Vertex) => XY {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  return (v) => ({
    x: (v.lng - origin.lng) * METERS_PER_DEGREE * cosLat,
    y: (v.lat - origin.lat) * METERS_PER_DEGREE,
  });
}

/** A ring's vertices with their Douglas-Peucker significance. */

/**
 *
 */
export interface RankedRing {
  /** Open ring (closing vertex dropped). */
  vertices: Vertex[];
  /**
   * Per vertex, the largest tolerance at which Douglas-Peucker still keeps it:
   * its own split distance, capped by every enclosing split's. Anchors are
   * `Infinity`. Simplifying at tolerance `t` keeps exactly the vertices whose
   * significance exceeds `t`.
   */
  significance: Float64Array;
}

/**
 * Rank a ring's vertices by Douglas-Peucker significance, in one pass.
 *
 * Iterative (an explicit stack), so a pathological ring cannot overflow the
 * call stack, and done once per ring rather than once per tolerance.
 *
 * @param ring - Closed ring of `[lng, lat]` pairs.
 * @returns The ranking, or `null` when the ring is too small to simplify.
 */
export function rankVertices(ring: number[][]): RankedRing | null {
  const vertices = thinVertices(openRing(toVertices(ring)));
  const [first] = vertices;
  if (!first || vertices.length <= 3) return null;

  const project = projector(first);
  const points = vertices.map(project);
  const start = project(first);

  // Split the ring at its first vertex and the vertex farthest from it, so the
  // two halves are open polylines. The closing vertex is the first one again.
  const farIndex = farthestFromPoint(points, start);
  if (farIndex === 0) return null;
  points.push(start);

  const significance = new Float64Array(vertices.length);
  significance.fill(Infinity, 0, 1);
  significance.fill(Infinity, farIndex, farIndex + 1);

  // Each span carries the significance cap inherited from the split above it.
  const stack: [number, number, number][] = [
    [0, farIndex, Infinity],
    [farIndex, vertices.length, Infinity],
  ];
  for (let span = stack.pop(); span; span = stack.pop()) {
    const [lo, hi, cap] = span;
    const split = farthestFromChord(points, lo, hi);
    if (!split) continue;
    const [maxIndex, maxDistance] = split;

    const rank = Math.min(maxDistance, cap);
    significance.fill(rank, maxIndex, maxIndex + 1);
    stack.push([lo, maxIndex, rank], [maxIndex, hi, rank]);
  }

  return { vertices, significance };
}

/**
 * Thin an open ring before ranking: drop vertices within
 * `MIN_VERTEX_SPACING_M` of the last kept one, then, if still over
 * `MAX_RANKED_VERTICES`, sample evenly down to it. Kept vertices are a subset
 * of the input, in order.
 *
 * @param vertices - Open ring.
 * @returns The thinned open ring.
 */
export function thinVertices(vertices: Vertex[]): Vertex[] {
  const spaced: Vertex[] = [];
  let last: Vertex | undefined;
  for (const v of vertices) {
    if (!last || haversineDistance(last, v) >= MIN_VERTEX_SPACING_M) {
      spaced.push(v);
      last = v;
    }
  }
  if (spaced.length <= MAX_RANKED_VERTICES) return spaced;

  const stride = spaced.length / MAX_RANKED_VERTICES;
  return Array.from(
    { length: MAX_RANKED_VERTICES },
    (_, i) => spaced.at(Math.floor(i * stride)) ?? spaced[0],
  ).filter((v): v is Vertex => v !== undefined);
}

/**
 * Index of the point farthest from `origin`.
 *
 * @param points - Projected points.
 * @param origin - The reference point.
 * @returns The index; 0 when every point coincides with `origin`.
 */
function farthestFromPoint(points: XY[], origin: XY): number {
  let farIndex = 0;
  let farDistance = 0;
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - origin.x, p.y - origin.y);
    if (d > farDistance) {
      farDistance = d;
      farIndex = i;
    }
  });
  return farIndex;
}

/**
 * The interior point of `points[lo..hi]` farthest from the chord `lo`-`hi`.
 *
 * @param points - Projected points.
 * @param lo - Index of the span's first point.
 * @param hi - Index of the span's last point.
 * @returns `[index, distance]`, or `null` when the span has no interior point.
 */
function farthestFromChord(
  points: XY[],
  lo: number,
  hi: number,
): [number, number] | null {
  const a = points.at(lo);
  const b = points.at(hi);
  if (!a || !b || hi - lo < 2) return null;

  let maxDistance = -1;
  let maxIndex = lo;
  points.slice(lo + 1, hi).forEach((p, offset) => {
    const d = pointToSegment(p, a, b);
    if (d > maxDistance) {
      maxDistance = d;
      maxIndex = lo + 1 + offset;
    }
  });
  return [maxIndex, maxDistance];
}

/**
 * The Douglas-Peucker simplification of a ranked ring at one tolerance.
 *
 * When fewer than three vertices clear the tolerance — a sliver narrower than
 * it — the three most significant are kept, so the result is always a valid
 * triangle-or-better and never larger than the ranked ring.
 *
 * @param ranked - The ring and its vertex significance.
 * @param toleranceMeters - Simplification tolerance.
 * @returns The closed simplified ring.
 */
export function filterBySignificance(
  ranked: RankedRing,
  toleranceMeters: number,
): number[][] {
  const { vertices, significance } = ranked;
  let floor = toleranceMeters;
  const aboveTolerance = significance.filter((v) => v > toleranceMeters);
  if (aboveTolerance.length < 3) {
    // The third-largest significance: keep exactly the top three (ties aside).
    floor = [...significance].sort((a, b) => b - a).at(2) ?? 0;
    const kept = vertices.filter((_, i) => (significance.at(i) ?? 0) >= floor);
    return fromVertices(closeRing(kept));
  }
  const kept = vertices.filter((_, i) => (significance.at(i) ?? 0) > floor);
  return fromVertices(closeRing(kept));
}

/**
 * Planar distance from a point to a segment.
 *
 * @param p - The point.
 * @param a - Segment start.
 * @param b - Segment end.
 * @returns The distance, in the projection's units.
 */
export function pointToSegment(p: XY, a: XY, b: XY): number {
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
export function toVertices(ring: number[][]): Vertex[] {
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
