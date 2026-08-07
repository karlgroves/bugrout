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
