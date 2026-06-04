/**
 * Waypoint Insertion for Resource Stops
 *
 * Finds the best resource point (fuel, water) along a route corridor
 * and inserts it as a waypoint without excessive detour.
 *
 * Algorithm:
 * 1. Buffer the route polyline by the max detour distance
 * 2. Query SQLite for resource points within that corridor
 * 3. Rank candidates by total detour distance
 * 4. Return the best candidate as a waypoint LatLng
 */

import { getResourcesNearPoint } from "@/db/queries/resources";
import { haversineDistance } from "@/utils/geo";

import type { LatLng, ResourceType, ResourcePoint } from "@bugrout/shared";

/** Default max detour: ~10 miles */
const DEFAULT_MAX_DETOUR_METERS = 16000;

/** Convert meters to approximate degrees for SQL bbox query */
const METERS_TO_DEGREES = 1 / 111320;

/**
 *
 */
export interface WaypointCandidate {
  resource: ResourcePoint;
  /** Distance from the nearest route point to this resource */
  distanceFromRoute: number;
  /** Estimated total detour in meters (there + back to route) */
  estimatedDetour: number;
}

/**
 * Find the best resource stop along a route corridor.
 *
 * @param routeCoordinates - The route polyline
 * @param type - Resource type to search for (fuel, water)
 * @param maxDetour - Maximum acceptable detour in meters
 * @returns Best candidate, or null if none found within tolerance
 */
export async function findBestResourceStop(
  routeCoordinates: LatLng[],
  type: ResourceType,
  maxDetour: number = DEFAULT_MAX_DETOUR_METERS,
): Promise<WaypointCandidate | null> {
  if (routeCoordinates.length === 0) return null;

  // Sample points along the route at regular intervals
  // (every ~5km to avoid querying too many points)
  const samplePoints = sampleRoute(routeCoordinates, 5000);

  // Query for resources near each sample point
  const radiusDegrees = (maxDetour / 2) * METERS_TO_DEGREES;
  const allCandidates = new Map<string, WaypointCandidate>();

  for (const point of samplePoints) {
    const nearby = await getResourcesNearPoint(
      point.lat,
      point.lng,
      radiusDegrees,
      type,
    );

    for (const resource of nearby) {
      if (allCandidates.has(resource.id)) continue;

      const distFromRoute = getMinDistanceToPolyline(
        { lat: resource.lat, lng: resource.lng },
        routeCoordinates,
      );

      // Estimated detour: distance off route * 2 (there and back)
      const estimatedDetour = distFromRoute * 2;

      if (estimatedDetour <= maxDetour) {
        allCandidates.set(resource.id, {
          resource,
          distanceFromRoute: distFromRoute,
          estimatedDetour,
        });
      }
    }
  }

  if (allCandidates.size === 0) return null;

  // Rank by smallest detour
  const sorted = Array.from(allCandidates.values()).sort(
    (a, b) => a.estimatedDetour - b.estimatedDetour,
  );

  return sorted[0] ?? null;
}

/**
 * Find resource stops and return them as waypoints for the route engine.
 */
export async function getResourceWaypoints(
  routeCoordinates: LatLng[],
  preferences: { type: ResourceType; maxDetour: number; enabled: boolean }[],
): Promise<LatLng[]> {
  const waypoints: LatLng[] = [];

  for (const pref of preferences) {
    if (!pref.enabled) continue;

    const candidate = await findBestResourceStop(
      routeCoordinates,
      pref.type,
      pref.maxDetour,
    );

    if (candidate) {
      waypoints.push({
        lat: candidate.resource.lat,
        lng: candidate.resource.lng,
      });
    }
  }

  return waypoints;
}

/**
 * Sample points along a polyline at regular intervals.
 */
function sampleRoute(coordinates: LatLng[], intervalMeters: number): LatLng[] {
  const first = coordinates[0];
  if (!first) return [];

  const samples: LatLng[] = [first];
  let accumulated = 0;

  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1];
    const curr = coordinates[i];
    if (!prev || !curr) continue;
    const dist = haversineDistance(prev, curr);
    accumulated += dist;

    if (accumulated >= intervalMeters) {
      samples.push(curr);
      accumulated = 0;
    }
  }

  // Always include the last point
  const last = coordinates[coordinates.length - 1];
  if (last && samples[samples.length - 1] !== last) {
    samples.push(last);
  }

  return samples;
}

/**
 * Get minimum distance from a point to any segment of a polyline.
 */
function getMinDistanceToPolyline(point: LatLng, polyline: LatLng[]): number {
  let minDist = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    if (!a || !b) continue;
    const dist = pointToSegmentDistance(point, a, b);
    if (dist < minDist) minDist = dist;
  }

  return minDist;
}

/**
 * Distance from a point to a line segment (approximate, using haversine to endpoints).
 */
function pointToSegmentDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const dA = haversineDistance(p, a);
  const dB = haversineDistance(p, b);
  const dAB = haversineDistance(a, b);

  // If the segment is very short, just use distance to nearest endpoint
  if (dAB < 10) return Math.min(dA, dB);

  // Use projection: if point projects outside segment, use nearest endpoint
  // Approximate with scalar projection on flat plane
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.lat - a.lat) * (b.lat - a.lat) + (p.lng - a.lng) * (b.lng - a.lng)) /
        (dAB * dAB * METERS_TO_DEGREES * METERS_TO_DEGREES),
    ),
  );

  const projected: LatLng = {
    lat: a.lat + t * (b.lat - a.lat),
    lng: a.lng + t * (b.lng - a.lng),
  };

  return haversineDistance(p, projected);
}
