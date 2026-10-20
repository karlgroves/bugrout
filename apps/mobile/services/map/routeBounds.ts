/**
 * The bounding box of a route, for framing it on the map.
 *
 * A calculated route used to be drawn without moving the camera, which stayed
 * wherever `cameraStart` had opened it — the centre of the downloaded region
 * at zoom 7 when no GPS fix had arrived yet. So a 2.5 mi Baltimore route was
 * drawn somewhere inside a view of the whole of Maryland, and the report for
 * #190 was that "the map opened zoomed out to the whole state, with the route
 * line not visible".
 */

import type { LatLng } from "@bugrout/shared";

/**
 * A route's extent as MapLibre's `fitBounds` takes it: north-east and
 * south-west corners, each `[lng, lat]`.
 */
export interface RouteBounds {
  /** North-east corner, `[lng, lat]`. */
  ne: [number, number];
  /** South-west corner, `[lng, lat]`. */
  sw: [number, number];
}

export /**
 * Screen padding left around a fitted route, in points.
 *
 * Generous on purpose: every screen that frames a route covers its own edges —
 * the preview with its summary sheet, the map tab with the status row and the
 * resource chips — and a route tight against the frame reads as one running
 * off it.
 */
const ROUTE_FIT_PADDING = 64;

/**
 * The bounding box containing every coordinate of a route.
 *
 * @param coordinates - The route's decoded coordinates.
 * @returns The enclosing bounds, or null when there is nothing to frame.
 */
export function routeBounds(
  coordinates: readonly LatLng[] | null | undefined,
): RouteBounds | null {
  const first = coordinates?.[0];
  if (!coordinates || !first) return null;

  let { lat: north, lng: east } = first;
  let { lat: south, lng: west } = first;

  for (const { lat, lng } of coordinates) {
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lng > east) east = lng;
    if (lng < west) west = lng;
  }

  return { ne: [east, north], sw: [west, south] };
}

/**
 * Whether bounds enclose no area, so there is no box to fit.
 *
 * A one-coordinate route, or one whose coordinates are all the same point,
 * gives a zero-area box. `fitBounds` on one of those has no scale to solve
 * for and snaps to the maximum zoom, which is how a degenerate route would
 * have landed the camera on a street-level view of a single point.
 *
 * @param bounds - The bounds to test.
 * @returns True when the box has neither width nor height.
 */
export function isDegenerate(bounds: RouteBounds): boolean {
  return bounds.ne[0] === bounds.sw[0] && bounds.ne[1] === bounds.sw[1];
}
