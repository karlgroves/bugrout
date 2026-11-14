/**
 * Route Engine
 *
 * High-level routing service that wraps Valhalla and adds:
 * - Threat avoidance (exclude polygons for fire and flood zones; weather zones
 *   are warned about in the preview, not routed around)
 * - (not yet) ELF congestion weighting: the pipeline writes a weight table
 *   but applies it to no route, so routes here are plain fastest-path (#195)
 * - Waypoint insertion for resource stops
 * - Deviation detection and automatic rerouting
 */
/* eslint-disable complexity -- pre-existing; tracked in docs/tech-debt.md (calculateSmartRoute: two-pass threat-avoidance + waypoint routing) */

import { useRouteStore } from "@/stores/useRouteStore";
import { useThreatStore } from "@/stores/useThreatStore";
import { haversineDistance, projectOntoPolyline } from "@/utils/geo";

import * as Valhalla from "../valhalla/ValhallaModule";

import {
  countUnreadableThreats,
  threatsToAvoidancePolygons,
  withUnavoidedThreats,
} from "./ThreatAvoidance";
import { getResourceWaypoints } from "./WaypointInsertion";

import type {
  DroppedStop,
  LatLng,
  ResourcePoint,
  Route,
  RouteOptions,
  ResourceStopPreference,
} from "@bugrout/shared";

const DEVIATION_THRESHOLD_METERS = 500;

/**
 * Calculate a route with automatic threat avoidance and resource waypoints.
 * This is the high-level "smart route" that incorporates all BugRout features.
 *
 * Any resource stop the caller asked for and did not get is recorded on the
 * route store for the preview to show (#341). The list is replaced on every
 * calculation, so a reroute never carries the previous route's drops.
 *
 * Threat areas the route was not planned around travel on the route itself,
 * as `unavoidedThreats` (#337): the ones the routing engine's limit left out
 * (counted by AvoidanceFit as the request is built, and put on the route by
 * ValhallaModule) plus any zone whose geometry is unreadable.
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
  // Zones threatsToAvoidancePolygons had to leave out. Nothing is "unavoided"
  // when the driver turned avoidance off: that was their choice.
  const unreadable = avoidanceEnabled ? countUnreadableThreats(threatZones) : 0;

  // First pass: calculate base route (no waypoints) to get a corridor
  const baseRoute = await Valhalla.calculateRoute(origin, destination, {
    ...extraOptions,
    avoidPolygons: [...(extraOptions?.avoidPolygons ?? []), ...avoidPolygons],
  });

  // Find resource waypoints along the base route corridor
  let waypoints: LatLng[] = extraOptions?.waypoints ?? [];
  let resourceWaypoints: LatLng[] = [];
  let chosenStops: ResourcePoint[] = [];
  let dropped: DroppedStop[] = [];

  if (resourcePreferences?.some((p) => p.enabled)) {
    const plan = await getResourceWaypoints(
      baseRoute.coordinates,
      resourcePreferences,
      threatZones,
    );
    resourceWaypoints = plan.waypoints;
    chosenStops = plan.chosen;
    dropped = plan.dropped;
    waypoints = [...waypoints, ...resourceWaypoints];
  }

  // If we have waypoints, recalculate with them
  if (waypoints.length > 0) {
    try {
      const withStops = await Valhalla.calculateRoute(origin, destination, {
        ...extraOptions,
        avoidPolygons: [
          ...(extraOptions?.avoidPolygons ?? []),
          ...avoidPolygons,
        ],
        waypoints,
      });
      reportDroppedStops(dropped);
      return withUnavoidedThreats(withStops, unreadable);
    } catch (err) {
      // An optional resource stop must never cost the user the route they
      // already have (#295). The base route carries the caller's own
      // waypoints, so only the resource stops are lost.
      if (resourceWaypoints.length === 0) {
        reportDroppedStops(dropped);
        throw err;
      }
      console.warn(
        "[BugRout] routing with resource stops failed; using the route without them:",
        err,
      );
      reportDroppedStops([
        ...dropped,
        ...chosenStops.map((stop): DroppedStop => ({
          type: stop.type,
          reason: "routing-failed",
          name: stop.name,
          detourMeters: null,
        })),
      ]);
      return withUnavoidedThreats(baseRoute, unreadable);
    }
  }

  reportDroppedStops(dropped);
  return withUnavoidedThreats(baseRoute, unreadable);
}

/**
 * Hand the preview the stops this route does not include (#341).
 *
 * Always called, with an empty list when nothing was dropped, so the notice
 * never outlives the route it described.
 */
function reportDroppedStops(dropped: DroppedStop[]): void {
  useRouteStore.getState().setDroppedStops(dropped);
}

/**
 * Check if the user has deviated from the active route.
 *
 * Returns true if the current position is more than 500m from the route
 * polyline — measured to the nearest point on the line, not the nearest
 * vertex, so a driver mid-way along a long straight segment is on route
 * (#298). A route with no geometry has nothing to deviate from, so it
 * returns false rather than latching the driver as off route.
 */
export function hasDeviated(
  currentPosition: LatLng,
  routeCoordinates: LatLng[],
): boolean {
  const projection = projectOntoPolyline(currentPosition, routeCoordinates);
  if (!projection) return false;
  return projection.offMeters > DEVIATION_THRESHOLD_METERS;
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
    const coord = routeCoordinates[i];
    if (!coord) continue;
    const dist = haversineDistance(position, coord);
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
    const a = route.coordinates[i];
    const b = route.coordinates[i + 1];
    if (!a || !b) continue;
    remainingDistance += haversineDistance(a, b);
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
