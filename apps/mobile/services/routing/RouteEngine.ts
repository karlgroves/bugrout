/**
 * Route Engine
 *
 * High-level routing service that wraps Valhalla and adds:
 * - Threat avoidance (exclude polygons for fire/flood/weather zones)
 * - ELF-weighted routing (baked into tiles at build time)
 * - Waypoint insertion for resource stops
 * - Deviation detection and automatic rerouting
 */

import type { LatLng, Route, RouteOptions, ResourceStopPreference } from "@bugrout/shared";
import * as Valhalla from "../valhalla/ValhallaModule";
import { threatsToAvoidancePolygons } from "./ThreatAvoidance";
import { getResourceWaypoints } from "./WaypointInsertion";
import { useThreatStore } from "@/stores/useThreatStore";
import { haversineDistance } from "@/utils/geo";

const DEVIATION_THRESHOLD_METERS = 500;

/**
 * Calculate a route with full threat avoidance and optional resource stops.
 */
export async function calculateRoute(
  origin: LatLng,
  destination: LatLng,
  options?: RouteOptions,
): Promise<Route> {
  return Valhalla.calculateRoute(origin, destination, options);
}

/**
 * Calculate a route with automatic threat avoidance and resource waypoints.
 * This is the high-level "smart route" that incorporates all BugRout features.
 */
export async function calculateSmartRoute(
  origin: LatLng,
  destination: LatLng,
  resourcePreferences?: ResourceStopPreference[],
  extraOptions?: RouteOptions,
): Promise<Route> {
  const { threatZones, avoidanceEnabled } = useThreatStore.getState();

  // Build avoidance polygons from active threats
  const avoidPolygons = avoidanceEnabled
    ? threatsToAvoidancePolygons(threatZones)
    : [];

  // First pass: calculate base route (no waypoints) to get a corridor
  const baseRoute = await Valhalla.calculateRoute(origin, destination, {
    ...extraOptions,
    avoidPolygons: [
      ...(extraOptions?.avoidPolygons ?? []),
      ...avoidPolygons,
    ],
  });

  // Find resource waypoints along the base route corridor
  let waypoints: LatLng[] = extraOptions?.waypoints ?? [];

  if (resourcePreferences && resourcePreferences.some((p) => p.enabled)) {
    const resourceWaypoints = await getResourceWaypoints(
      baseRoute.coordinates,
      resourcePreferences,
    );
    waypoints = [...waypoints, ...resourceWaypoints];
  }

  // If we have waypoints, recalculate with them
  if (waypoints.length > 0) {
    return Valhalla.calculateRoute(origin, destination, {
      ...extraOptions,
      avoidPolygons: [
        ...(extraOptions?.avoidPolygons ?? []),
        ...avoidPolygons,
      ],
      waypoints,
    });
  }

  return baseRoute;
}

/**
 * Check if the user has deviated from the active route.
 * Returns true if current position is more than 500m from the route polyline.
 */
export function hasDeviated(
  currentPosition: LatLng,
  routeCoordinates: LatLng[],
): boolean {
  const minDistance = getMinDistanceToPolyline(
    currentPosition,
    routeCoordinates,
  );
  return minDistance > DEVIATION_THRESHOLD_METERS;
}

/**
 * Find the closest point on the route to the current position.
 * Used for progress tracking and maneuver distance calculations.
 */
export function findClosestRoutePoint(
  position: LatLng,
  routeCoordinates: LatLng[],
): { index: number; distance: number } {
  let minDist = Infinity;
  let minIndex = 0;

  for (let i = 0; i < routeCoordinates.length; i++) {
    const dist = haversineDistance(position, routeCoordinates[i]);
    if (dist < minDist) {
      minDist = dist;
      minIndex = i;
    }
  }

  return { index: minIndex, distance: minDist };
}

/**
 * Estimate remaining distance and duration from current position.
 */
export function estimateRemaining(
  position: LatLng,
  route: Route,
): { distance: number; duration: number } {
  const { index } = findClosestRoutePoint(position, route.coordinates);

  // Sum distance from closest point to end
  let remainingDistance = 0;
  for (let i = index; i < route.coordinates.length - 1; i++) {
    remainingDistance += haversineDistance(
      route.coordinates[i],
      route.coordinates[i + 1],
    );
  }

  // Estimate duration proportionally
  const totalDistance = route.distance;
  const ratio = totalDistance > 0 ? remainingDistance / totalDistance : 0;
  const remainingDuration = route.duration * ratio;

  return {
    distance: remainingDistance,
    duration: remainingDuration,
  };
}

/**
 * Calculate minimum distance from a point to a polyline in meters.
 */
function getMinDistanceToPolyline(
  point: LatLng,
  polyline: LatLng[],
): number {
  if (polyline.length === 0) return Infinity;
  if (polyline.length === 1) return haversineDistance(point, polyline[0]);

  let minDist = Infinity;

  for (let i = 0; i < polyline.length - 1; i++) {
    const dist = pointToSegmentDistance(point, polyline[i], polyline[i + 1]);
    if (dist < minDist) {
      minDist = dist;
    }
  }

  return minDist;
}

function pointToSegmentDistance(
  p: LatLng,
  a: LatLng,
  b: LatLng,
): number {
  const dA = haversineDistance(p, a);
  const dB = haversineDistance(p, b);
  return Math.min(dA, dB);
}

export { DEVIATION_THRESHOLD_METERS };
