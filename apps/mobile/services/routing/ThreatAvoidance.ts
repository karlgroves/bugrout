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

import type { ThreatZone, GeoJSONPolygon, LatLng } from "@bugrout/shared";

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
  if (geometry === null || partCount(geometry) !== partCount(threat.geometry)) {
    return true;
  }

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

/** How many polygons a geometry holds: 1 for a Polygon, else its part count. */
function partCount(geometry: ThreatZone["geometry"]): number {
  return geometry.type === "Polygon" ? 1 : geometry.coordinates.length;
}
