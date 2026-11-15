/**
 * Threat Avoidance
 *
 * Converts active threat zones into Valhalla-compatible avoidance polygons.
 * Checks if a route intersects any active threats.
 */

import {
  pointInPolygon,
  sanitizeThreatGeometry,
  withUsableGeometry,
} from "../../utils/geo";

import type {
  GeoJSONPolygon,
  LatLng,
  Route,
  ThreatZone,
  UnavoidedThreats,
} from "@bugrout/shared";

/**
 * Convert active threat zones to Valhalla exclude_polygons format.
 *
 * Every part of a MultiPolygon becomes its own polygon. Fire perimeters are
 * often multi-part, and avoiding only the first part routed straight through
 * the others. The result is unbounded; `boundAvoidancePolygons` fits it to the
 * routing engine's limit when the request is built.
 *
 * Geometry is re-validated here as well as at ingest (#287): one non-numeric
 * coordinate would otherwise reshape a zone into a band across the route or
 * drop it, and a `null` geometry would throw and fail every route request.
 */
export function threatsToAvoidancePolygons(
  threats: ThreatZone[],
): GeoJSONPolygon[] {
  return withUsableGeometry(
    threats.filter((t) => t.type === "wildfire" || t.type === "flood"),
  ).flatMap((t) =>
    t.geometry.type === "Polygon"
      ? [t.geometry]
      : t.geometry.coordinates.map((rings) => ({
          type: "Polygon" as const,
          coordinates: rings,
        })),
  );
}

/**
 * Check if any point in a route's coordinate list falls within a threat zone.
 * Uses simple point-in-polygon test (ray casting) against every part of a
 * MultiPolygon.
 *
 * Fails safe (#287): a threat whose geometry, or any part of it, has no
 * readable outer ring counts as intersecting, because a fire perimeter we
 * cannot read must warn rather than stay silent. A malformed hole does not
 * count, since only outer rings are tested.
 */
export function routeIntersectsThreat(
  routeCoordinates: LatLng[],
  threat: ThreatZone,
): boolean {
  const geometry = sanitizeThreatGeometry(threat.geometry);
  if (geometry === null || hasUnreadablePart(threat, geometry)) return true;

  const outerRings =
    geometry.type === "Polygon"
      ? [geometry.coordinates[0]]
      : geometry.coordinates.map((rings) => rings[0]);

  return outerRings.some(
    (ring) =>
      ring !== undefined &&
      routeCoordinates.some((coord) =>
        pointInPolygon([coord.lng, coord.lat], ring),
      ),
  );
}

/**
 * How many fire and flood zones cannot be fully routed around because their
 * geometry, or a part of it, is unreadable (#337).
 *
 * `threatsToAvoidancePolygons` leaves those zones, or those parts, out of the
 * request, so the route is planned as if they were not there. Where such a
 * zone lies is unknown, so it is counted wherever it is — the same fail-safe
 * `routeIntersectsThreat` applies. Weather zones are never avoided and are not
 * counted.
 *
 * Geometry is validated at ingest and on the cache read (#287), so this is
 * zero unless a zone reached the store some other way.
 */
export function countUnreadableThreats(threats: ThreatZone[]): number {
  return threats.filter((t) => {
    if (t.type !== "wildfire" && t.type !== "flood") return false;
    const geometry = sanitizeThreatGeometry(t.geometry);
    return geometry === null || hasUnreadablePart(t, geometry);
  }).length;
}

/**
 * Record on a route the threat areas it was not planned around (#337).
 *
 * Adds to whatever the route already carries, and `"all"` stays `"all"`.
 * Returns the route itself when there is nothing to add, so a route with
 * nothing unavoided carries no field at all.
 */
export function withUnavoidedThreats(
  route: Route,
  unavoided: UnavoidedThreats,
): Route {
  if (unavoided === 0) return route;
  const already = route.unavoidedThreats ?? 0;
  return {
    ...route,
    unavoidedThreats:
      unavoided === "all" || already === "all" ? "all" : already + unavoided,
  };
}

/** Whether sanitizing dropped a whole part of a threat's geometry. */
function hasUnreadablePart(
  threat: ThreatZone,
  usable: ThreatZone["geometry"],
): boolean {
  return partCount(usable) !== partCount(threat.geometry);
}

/** How many polygons a geometry holds: 1 for a Polygon, else its part count. */
function partCount(geometry: ThreatZone["geometry"]): number {
  return geometry.type === "Polygon" ? 1 : geometry.coordinates.length;
}
