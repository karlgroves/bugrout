/**
 * Avoidance Fit
 *
 * Decides what one routing request will avoid, and keeps count of what it was
 * asked to avoid and will not (#337). Lives beside AvoidanceBudget rather than
 * in ValhallaModule, which is at its line budget.
 */

import { boundAvoidancePolygons } from "./AvoidanceBudget";

import type { LatLng, RouteOptions, UnavoidedThreats } from "@bugrout/shared";

/** What a request will avoid, and what it was asked to avoid and will not. */
export interface FittedAvoidance {
  /** Outer rings to send as `exclude_polygons`; empty when none apply. */
  rings: number[][][];
  /**
   * Polygons near the trip that are not in `rings` (#337), or `"all"` when
   * fitting failed and nothing is avoided. A polygon outside the trip corridor
   * is not counted: it could not have changed the route.
   */
  unavoided: UnavoidedThreats;
}

/**
 * Avoidance polygons for threat zones, fitted to the engine's exclude_polygons
 * perimeter limit — past it Valhalla rejects the whole request (#168).
 *
 * @param origin - Trip start.
 * @param destination - Trip end.
 * @param options - Route options carrying `avoidPolygons` and `waypoints`.
 * @returns The rings to send, and how many polygons were left unavoided.
 */
export function fitAvoidance(
  origin: LatLng,
  destination: LatLng,
  options?: RouteOptions,
): FittedAvoidance {
  const polygons = options?.avoidPolygons ?? [];
  if (polygons.length === 0) return { rings: [], unavoided: 0 };

  let bounded;
  try {
    bounded = boundAvoidancePolygons(polygons, [
      origin,
      ...(options?.waypoints ?? []),
      destination,
    ]);
  } catch (err) {
    // This runs before calculateRoute's try: a throw here would escape route
    // calculation entirely. Route without avoidance instead — the preview still
    // warns when the route crosses a threat.
    console.warn(
      "[BugRout] Could not fit threat polygons; routing without avoidance:",
      err,
    );
    return { rings: [], unavoided: "all" };
  }
  if (bounded.dropped > 0) {
    console.warn(
      `[BugRout] ${bounded.dropped} threat polygon(s) exceed the routing engine's avoidance limit and were not avoided.`,
    );
  }
  return {
    rings: bounded.polygons.flatMap((p) => p.coordinates.slice(0, 1)),
    unavoided: bounded.dropped,
  };
}
