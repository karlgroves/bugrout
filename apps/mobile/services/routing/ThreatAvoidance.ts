/**
 * Threat Avoidance
 *
 * Converts active threat zones into Valhalla-compatible avoidance polygons.
 * Checks if a route intersects any active threats.
 */

import { pointInPolygon } from "../../utils/geo";

import type { ThreatZone, GeoJSONPolygon, LatLng } from "@bugrout/shared";

/**
 * Convert active threat zones to Valhalla exclude_polygons format.
 *
 * Every part of a MultiPolygon becomes its own polygon. Fire perimeters are
 * often multi-part, and avoiding only the first part routed straight through
 * the others. The result is unbounded; `boundAvoidancePolygons` fits it to the
 * routing engine's limit when the request is built.
 */
export function threatsToAvoidancePolygons(
  threats: ThreatZone[],
): GeoJSONPolygon[] {
  return threats
    .filter((t) => t.type === "wildfire" || t.type === "flood")
    .flatMap((t) =>
      t.geometry.type === "Polygon"
        ? [t.geometry]
        : t.geometry.coordinates.map((rings) => ({
            type: "Polygon" as const,
            coordinates: rings,
          })),
    )
    .filter((p) => (p.coordinates[0]?.length ?? 0) > 0);
}

/**
 * Check if any point in a route's coordinate list falls within a threat zone.
 * Uses simple point-in-polygon test (ray casting) against every part of a
 * MultiPolygon.
 */
export function routeIntersectsThreat(
  routeCoordinates: LatLng[],
  threat: ThreatZone,
): boolean {
  const outerRings =
    threat.geometry.type === "Polygon"
      ? [threat.geometry.coordinates[0]]
      : threat.geometry.coordinates.map((rings) => rings[0]);

  return outerRings.some(
    (ring) =>
      ring !== undefined &&
      routeCoordinates.some((coord) =>
        pointInPolygon([coord.lng, coord.lat], ring),
      ),
  );
}
