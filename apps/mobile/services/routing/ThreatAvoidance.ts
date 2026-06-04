/**
 * Threat Avoidance
 *
 * Converts active threat zones into Valhalla-compatible avoidance polygons.
 * Checks if a route intersects any active threats.
 */

import type {
  ThreatZone,
  GeoJSONPolygon,
  LatLng,
} from "@bugrout/shared";

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
      // For MultiPolygon, return each polygon separately
      // Simplification: use just the first polygon
      if (t.geometry.type === "MultiPolygon") {
        return {
          type: "Polygon" as const,
          coordinates: t.geometry.coordinates[0],
        };
      }
      return null;
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

function pointInPolygon(
  point: [number, number],
  polygon: number[][],
): boolean {
  let inside = false;
  const [px, py] = point;
  if (px === undefined || py === undefined) return false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!pi || !pj) continue;
    const xi = pi[0],
      yi = pi[1];
    const xj = pj[0],
      yj = pj[1];
    if (
      xi === undefined ||
      yi === undefined ||
      xj === undefined ||
      yj === undefined
    ) {
      continue;
    }

    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
