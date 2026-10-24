/**
 * Geographic utility functions.
 */

import type { LatLng, BBox, ThreatZone } from "@bugrout/shared";

const EARTH_RADIUS_METERS = 6371000;

/**
 * Haversine distance between two points in meters.
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Check if a point is inside a bounding box.
 */
export function pointInBBox(point: LatLng, bbox: BBox): boolean {
  return (
    point.lat >= bbox.south &&
    point.lat <= bbox.north &&
    point.lng >= bbox.west &&
    point.lng <= bbox.east
  );
}

/**
 * Expand a bounding box by a distance in meters (approximate).
 */
export function expandBBox(bbox: BBox, meters: number): BBox {
  const latDelta = meters / 111320;
  const lngDelta =
    meters / (111320 * Math.cos(toRad((bbox.south + bbox.north) / 2)));

  return {
    south: bbox.south - latDelta,
    north: bbox.north + latDelta,
    west: bbox.west - lngDelta,
    east: bbox.east + lngDelta,
  };
}

/**
 * Flatten a threat geometry into its outer-ring coordinate pairs.
 *
 * For a Polygon this is the outer ring; for a MultiPolygon it is every
 * constituent polygon's outer ring, concatenated. Holes are ignored — the
 * callers use these rings for containment and overlap tests where treating a
 * hole as solid is the conservative (fail-safe) answer for a threat zone.
 *
 * @param geometry - The threat zone's GeoJSON geometry.
 * @returns Coordinate pairs as `[lng, lat]`.
 */
export function extractRingCoordinates(
  geometry: ThreatZone["geometry"],
): number[][] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] ?? [];
  }
  return geometry.coordinates.flatMap((poly) => poly[0] ?? []);
}

/**
 * Ray-casting point-in-polygon test.
 *
 * @param point - The test point as `[lng, lat]`.
 * @param polygon - A closed ring of `[lng, lat]` pairs.
 * @returns `true` when the point lies inside the ring.
 */
export function pointInPolygon(
  point: [number, number],
  polygon: number[][],
): boolean {
  let inside = false;
  const [px, py] = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!pi || !pj) continue;
    const xi = pi[0],
      yi = pi[1];
    const xj = pj[0],
      yj = pj[1];
    if (
      xi === undefined ||
      yi === undefined ||
      xj === undefined ||
      yj === undefined
    ) {
      continue;
    }

    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Format distance for display based on user's preferred units.
 */
export function formatDistance(meters: number, units: "mi" | "km"): string {
  if (units === "mi") {
    const miles = meters / 1609.344;
    return miles < 0.1
      ? `${Math.round(meters * 3.28084)} ft`
      : `${miles.toFixed(1)} mi`;
  }
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format duration in seconds to human-readable string.
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes} min`;
}

/**
 * Converts degrees to radians.
 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * A key that is the same for two points in the same place: their coordinates
 * rounded to 4 decimal places, about 11 m.
 *
 * Recent destinations are stored under this key, so using a place again
 * updates its entry instead of adding another (#191).
 *
 * @param point - The point to key.
 * @returns `"lat,lng"` at 4 decimal places.
 */
export function placeKey(point: LatLng): string {
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

/**
 * A point from two strings, when both are present and are real numbers.
 *
 * Route params and deep links arrive as strings, and a malformed one must read
 * as "no point given" rather than as `NaN` coordinates somewhere off the globe.
 *
 * @param lat - The latitude, as text.
 * @param lng - The longitude, as text.
 * @returns The point, or `null` when either is missing or not a number.
 */
export function pointFromStrings(
  lat: string | undefined,
  lng: string | undefined,
): LatLng | null {
  if (lat === undefined || lng === undefined) return null;
  // Number("") is 0, so a blank param would otherwise read as a coordinate on
  // the equator rather than as nothing given.
  if (lat.trim() === "" || lng.trim() === "") return null;

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  return { lat: parsedLat, lng: parsedLng };
}

/**
 * Where a point falls relative to a polyline: how far along it, and how far
 * off it.
 *
 * Returned by {@link projectOntoPolyline}.
 */
export interface PolylineProjection {
  /** Metres from the polyline's start to the nearest point on it. */
  alongMeters: number;
  /** Metres from the point to that nearest point on the polyline. */
  offMeters: number;
}

/**
 * Project a point onto a polyline, returning both how far along the line the
 * nearest point sits and how far the point is from the line there.
 *
 * Used to order fuel stations along the route ahead of the driver (#203):
 * "nearest to the route" alone is not enough, because a station behind the
 * driver is as close to the line as one in front of them.
 *
 * Each segment is projected on a locally flat plane with longitude scaled by
 * the latitude, which is accurate well past the length of a route segment.
 *
 * @param point - The point to project.
 * @param polyline - The line to project it onto.
 * @returns The projection, or `null` for an empty polyline.
 */
export function projectOntoPolyline(
  point: LatLng,
  polyline: LatLng[],
): PolylineProjection | null {
  const first = polyline[0];
  if (!first) return null;
  if (polyline.length === 1) {
    return { alongMeters: 0, offMeters: haversineDistance(point, first) };
  }

  let best: PolylineProjection = { alongMeters: 0, offMeters: Infinity };
  let travelled = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    if (!a || !b) continue;

    const segment = haversineDistance(a, b);
    const t = fractionAlongSegment(point, a, b);
    const nearest: LatLng = {
      lat: a.lat + t * (b.lat - a.lat),
      lng: a.lng + t * (b.lng - a.lng),
    };
    const off = haversineDistance(point, nearest);

    if (off < best.offMeters) {
      best = { alongMeters: travelled + t * segment, offMeters: off };
    }
    travelled += segment;
  }

  return best;
}

/**
 * How far along segment `a`→`b` the foot of the perpendicular from `p` falls,
 * clamped to the segment's ends.
 *
 * @returns 0 at `a`, 1 at `b`.
 */
function fractionAlongSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const latScale = Math.cos(toRad((a.lat + b.lat) / 2));
  const bx = (b.lng - a.lng) * latScale;
  const by = b.lat - a.lat;
  const denominator = bx * bx + by * by;
  if (denominator === 0) return 0;

  const px = (p.lng - a.lng) * latScale;
  const py = p.lat - a.lat;
  return Math.min(1, Math.max(0, (px * bx + py * by) / denominator));
}
