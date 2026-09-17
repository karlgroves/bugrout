/**
 * Alert Parser
 *
 * Determines which threat zones overlap the user's visible map region. The
 * route-intersection test lives in routing/ThreatAvoidance, which is where
 * both the route preview and the routing engine already read it from.
 */
/* eslint-disable complexity -- pre-existing; tracked in docs/tech-debt.md (threatOverlapsBBox: geometric test with many inline coordinate guards) */

import { extractRingCoordinates, pointInPolygon } from "../../utils/geo";

import type { ThreatZone, BBox } from "@bugrout/shared";

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
