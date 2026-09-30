/**
 * Where the map opens.
 *
 * MapLibre applies a camera's `defaultSettings` once, on first render. The map
 * used to open on the user's location only if a fix had already arrived by
 * then, and otherwise on the centre of California — so on launch, before the
 * first GPS fix, a Maryland user saw an empty map far outside their tiles
 * (#183). This picks the best place known at first render; `BugroutMap` then
 * moves to the user once a fix arrives.
 */

import type { BBox, LatLng } from "@bugrout/shared";

/** A MapLibre camera position. */
export interface CameraPosition {
  /** `[lng, lat]` */
  centerCoordinate: [number, number];
  zoomLevel: number;
}

export /** Street-level zoom for a known position. */
const LOCATED_ZOOM = 12;

/** Zoom showing a whole downloaded region. */
const REGION_ZOOM = 7;

/** The contiguous United States, when nothing more specific is known. */
const OVERVIEW: CameraPosition = {
  centerCoordinate: [-98.5795, 39.8283],
  zoomLevel: 3,
};

/**
 * The camera position to open the map at.
 *
 * @param userLocation - The user's position, when a fix has arrived.
 * @param regionBBox - The bounds of the downloaded region on display, if any.
 * @returns The user's position at street zoom; else the region's centre; else
 *   an overview of the contiguous US.
 */
export function cameraStart(
  userLocation: LatLng | null | undefined,
  regionBBox: BBox | null | undefined,
): CameraPosition {
  if (userLocation) {
    return {
      centerCoordinate: [userLocation.lng, userLocation.lat],
      zoomLevel: LOCATED_ZOOM,
    };
  }
  if (regionBBox) {
    return {
      centerCoordinate: [
        (regionBBox.west + regionBBox.east) / 2,
        (regionBBox.south + regionBBox.north) / 2,
      ],
      zoomLevel: REGION_ZOOM,
    };
  }
  return OVERVIEW;
}
