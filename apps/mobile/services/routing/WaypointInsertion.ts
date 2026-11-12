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

import { routeIntersectsThreat } from "./ThreatAvoidance";

import type {
  DroppedStop,
  LatLng,
  ResourceType,
  ResourcePoint,
  ThreatZone,
} from "@bugrout/shared";

/** Default max detour: ~10 miles */
const DEFAULT_MAX_DETOUR_METERS = 16000;

/** Convert meters to approximate degrees for SQL bbox query */
const METERS_TO_DEGREES = 1 / 111320;

/**
 *
 */
interface WaypointCandidate {
  resource: ResourcePoint;
  /** Distance from the nearest route point to this resource */
  distanceFromRoute: number;
  /** Estimated total detour in meters (there + back to route) */
  estimatedDetour: number;
  /** Whether this resource sits inside an active threat zone */
  inThreat: boolean;
}

/**
 * The outcome of searching the corridor for one kind of stop.
 *
 * `blocked` is the nearest candidate that was passed over because it is
 * inside an active threat zone. It is what makes "we found nothing usable"
 * tellable apart from "there is nothing out here", which the preview needs in
 * order to say why a stop is missing (#341).
 */
interface StopSearch {
  best: WaypointCandidate | null;
  blocked: WaypointCandidate | null;
}

/**
 * Search a route corridor for one kind of resource stop.
 *
 * A resource inside an active threat zone is never chosen, but it is still
 * reported back as `blocked` so the caller can say why nothing was chosen.
 *
 * @param routeCoordinates - The route polyline
 * @param type - Resource type to search for (fuel, water)
 * @param maxDetour - Maximum acceptable detour in meters
 * @param threats - Active threat zones
 * @returns The best usable candidate and the nearest threat-blocked one,
 *   either of which may be null
 */
async function searchResourceStops(
  routeCoordinates: LatLng[],
  type: ResourceType,
  maxDetour: number = DEFAULT_MAX_DETOUR_METERS,
  threats: ThreatZone[] = [],
): Promise<StopSearch> {
  if (routeCoordinates.length === 0) return { best: null, blocked: null };

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
          inThreat: insideAnyThreat(resource, threats),
        });
      }
    }
  }

  // Rank by smallest detour
  const sorted = Array.from(allCandidates.values()).sort(
    (a, b) => a.estimatedDetour - b.estimatedDetour,
  );

  return {
    best: sorted.find((c) => !c.inThreat) ?? null,
    blocked: sorted.find((c) => c.inThreat) ?? null,
  };
}

/**
 * A stop inside an active threat zone is not a stop (#295).
 *
 * Every threat type counts, not only the ones that become Valhalla exclude
 * polygons: a wildfire or flood stop makes the waypoint request unroutable,
 * and a weather stop would pull the route into the hazard.
 */
function insideAnyThreat(resource: ResourcePoint, threats: ThreatZone[]) {
  const point = [{ lat: resource.lat, lng: resource.lng }];
  return threats.some((threat) => routeIntersectsThreat(point, threat));
}

/**
 * The waypoints to route through, and the stops that are not among them.
 */
export interface ResourceStopPlan {
  /** One waypoint per stop that was found and is usable. */
  waypoints: LatLng[];
  /** The stops that were asked for and are not on the route (#341). */
  dropped: DroppedStop[];
  /** The chosen stop for each waypoint, in the same order as `waypoints`. */
  chosen: ResourcePoint[];
}

/**
 * Find resource stops and return them as waypoints for the route engine.
 *
 * Every enabled preference that yields no waypoint is reported in `dropped`
 * with the reason, because a stop the driver asked for and did not get is a
 * change to their plan, not a detail (#341).
 *
 * @param threats - Active threat zones; resources inside them are skipped
 */
export async function getResourceWaypoints(
  routeCoordinates: LatLng[],
  preferences: { type: ResourceType; maxDetour: number; enabled: boolean }[],
  threats: ThreatZone[] = [],
): Promise<ResourceStopPlan> {
  const waypoints: LatLng[] = [];
  const chosen: ResourcePoint[] = [];
  const dropped: DroppedStop[] = [];

  for (const pref of preferences) {
    if (!pref.enabled) continue;

    const { best, blocked } = await searchResourceStops(
      routeCoordinates,
      pref.type,
      pref.maxDetour,
      threats,
    );

    if (best) {
      waypoints.push({ lat: best.resource.lat, lng: best.resource.lng });
      chosen.push(best.resource);
      continue;
    }

    dropped.push(
      blocked
        ? {
            type: pref.type,
            reason: "in-threat",
            name: blocked.resource.name,
            detourMeters: blocked.estimatedDetour,
          }
        : {
            type: pref.type,
            reason: "none-nearby",
            name: null,
            detourMeters: null,
          },
    );
  }

  return { waypoints, dropped, chosen };
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
