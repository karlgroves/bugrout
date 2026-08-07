/**
 * Alert Parser
 *
 * Parses NWS CAP (Common Alerting Protocol) alerts.
 * Determines if alerts intersect the user's active route or visible region.
 */
/* eslint-disable complexity -- pre-existing; tracked in docs/tech-debt.md (threatOverlapsBBox: geometric test with many inline coordinate guards) */

import { extractRingCoordinates, pointInPolygon } from "../../utils/geo";
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
  const coords = extractRingCoordinates(threat.geometry);

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
