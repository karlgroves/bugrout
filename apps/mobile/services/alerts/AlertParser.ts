/**
 * Alert Parser
 *
 * Parses NWS CAP (Common Alerting Protocol) alerts.
 * Determines if alerts intersect the user's active route or visible region.
 */
/* eslint-disable complexity -- pre-existing; tracked in docs/tech-debt.md (threatOverlapsBBox/pointInPolygon: geometric tests with many inline coordinate guards) */

import { routeIntersectsThreat } from "../routing/ThreatAvoidance";

import type { ThreatZone, LatLng, BBox } from "@bugrout/shared";

/**
 *
 */
export interface AlertNotification {
  threatZone: ThreatZone;
  intersectsRoute: boolean;
  message: string;
}

/**
 * Check a list of threat zones against the active route and generate notifications.
 */
export function checkAlertsAgainstRoute(
  threats: ThreatZone[],
  routeCoordinates: LatLng[],
): AlertNotification[] {
  return threats
    .filter((t) => t.expiresAt === null || t.expiresAt > Date.now())
    .map((t) => {
      const intersects = routeIntersectsThreat(routeCoordinates, t);
      return {
        threatZone: t,
        intersectsRoute: intersects,
        message: intersects
          ? `${t.headline} — your route passes through this area. Reroute recommended.`
          : t.headline,
      };
    })
    .filter((n) => n.intersectsRoute);
}

/**
 * Check if a threat zone's geometry overlaps a bounding box.
 * Used to filter threats to the user's visible map region.
 *
 * Tests whether any vertex of the threat polygon falls within the bbox,
 * OR any corner of the bbox falls within the threat polygon.
 */
export function threatOverlapsBBox(threat: ThreatZone, bbox: BBox): boolean {
  const coords = extractAllCoordinates(threat.geometry);

  // Check 1: Any threat vertex inside bbox?
  for (const [lng, lat] of coords) {
    if (lng === undefined || lat === undefined) continue;
    if (
      lat >= bbox.south &&
      lat <= bbox.north &&
      lng >= bbox.west &&
      lng <= bbox.east
    ) {
      return true;
    }
  }

  // Check 2: Any bbox corner inside threat polygon?
  // (Catches case where threat completely contains the bbox)
  if (coords.length >= 3) {
    const bboxCorners: [number, number][] = [
      [bbox.west, bbox.south],
      [bbox.east, bbox.south],
      [bbox.east, bbox.north],
      [bbox.west, bbox.north],
    ];

    for (const corner of bboxCorners) {
      if (pointInPolygon(corner, coords)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Filter threats to only those visible in the current bbox.
 */
export function filterThreatsInBBox(
  threats: ThreatZone[],
  bbox: BBox,
): ThreatZone[] {
  return threats.filter((t) => threatOverlapsBBox(t, bbox));
}

/**
 * Extract all coordinate pairs from a geometry.
 */
function extractAllCoordinates(geometry: ThreatZone["geometry"]): number[][] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] ?? []; // outer ring
  }
  return geometry.coordinates.flatMap((poly) => poly[0] ?? []);
}

/**
 * Ray-casting point-in-polygon test.
 */
function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  let inside = false;
  const [px, py] = point;
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
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
