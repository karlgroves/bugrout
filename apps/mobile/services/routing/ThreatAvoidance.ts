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
 */
export function threatsToAvoidancePolygons(
  threats: ThreatZone[],
): GeoJSONPolygon[] {
  return threats
    .filter((t) => t.type === "wildfire" || t.type === "flood")
    .map((t) => {
      if (t.geometry.type === "Polygon") {
        return t.geometry;
      }
      // For MultiPolygon, simplify by using just the first polygon.
      const firstPolygon = t.geometry.coordinates[0];
      if (!firstPolygon) return null;
      return {
        type: "Polygon" as const,
        coordinates: firstPolygon,
      };
    })
    .filter((p): p is GeoJSONPolygon => p !== null);
}

/**
 * Check if any point in a route's coordinate list falls within a threat zone.
 * Uses simple point-in-polygon test (ray casting).
 */
export function routeIntersectsThreat(
  routeCoordinates: LatLng[],
  threat: ThreatZone,
): boolean {
  const polygon =
    threat.geometry.type === "Polygon"
      ? threat.geometry.coordinates[0]
      : threat.geometry.coordinates[0]?.[0];

  if (!polygon) return false;

  return routeCoordinates.some((coord) =>
    pointInPolygon([coord.lng, coord.lat], polygon),
  );
}
