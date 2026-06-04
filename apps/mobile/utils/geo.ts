/**
 * Geographic utility functions.
 */

import type { LatLng, BBox } from "@bugrout/shared";

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
