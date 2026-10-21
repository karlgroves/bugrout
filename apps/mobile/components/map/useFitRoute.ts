/**
 * Framing a drawn route on the map (#190).
 */

import { useCallback, useEffect, useRef } from "react";

import { LOCATED_ZOOM } from "@/services/map/cameraStart";
import {
  isDegenerate,
  routeBounds,
  ROUTE_FIT_PADDING,
} from "@/services/map/routeBounds";

import type * as MapLibreGL from "@/platform/maplibre";
import type { LatLng } from "@bugrout/shared";

/** How long the camera takes to move onto a route, in ms. */
const FIT_DURATION = 600;

/** What {@link useFitRoute} hands back to the map. */
export interface FitRouteResult {
  /**
   * Whether the camera move that has just settled was a fit this hook issued,
   * clearing the record of it. Callers tracking the zoom level ask once per
   * settled camera move.
   */
  fitJustSettled: () => boolean;
}

/**
 * A route's identity for framing purposes: its length and its end points.
 *
 * Framing happens once per route, not on every render, so that a user who
 * pans or zooms away keeps the view they chose. Comparing by array identity
 * would re-fit whenever a caller rebuilt an equal array, and comparing every
 * coordinate costs more than it saves on a route with thousands of them.
 *
 * @param coordinates - The route's coordinates.
 * @returns A key that changes when the route does, or null for no route.
 */
function routeKey(
  coordinates: readonly LatLng[] | null | undefined,
): string | null {
  const first = coordinates?.[0];
  const last = coordinates?.[coordinates.length - 1];
  if (!coordinates || !first || !last) return null;
  return `${String(coordinates.length)}:${String(first.lat)},${String(first.lng)}:${String(last.lat)},${String(last.lng)}`;
}

/**
 * Move the camera onto a newly drawn route so the whole of it is visible.
 *
 * Does nothing while the camera follows the user: during navigation the map is
 * deliberately at street level on the driver's position, and pulling out to
 * the whole route would undo that.
 *
 * @param cameraRef - The map's camera handle.
 * @param routeCoordinates - The drawn route's coordinates, if any.
 * @param followUser - Whether the camera is following the user.
 * @param reducedMotion - Whether to move without animating.
 * @returns Whether a settled camera move was this hook's fit.
 */
export function useFitRoute(
  cameraRef: React.RefObject<MapLibreGL.CameraRef | null>,
  routeCoordinates: readonly LatLng[] | null | undefined,
  followUser: boolean,
  reducedMotion: boolean,
): FitRouteResult {
  // The route last framed, so each one is framed once.
  const fittedKey = useRef<string | null>(null);
  // Set between issuing a fit and the camera settling from it.
  const pendingFit = useRef(false);

  const key = routeKey(routeCoordinates);

  useEffect(() => {
    // Keep no record of a route while following the user, so the route is
    // framed if the trip ends and the map returns to an overview of it.
    if (followUser) return;
    if (key === null) {
      fittedKey.current = null;
      return;
    }
    if (key === fittedKey.current) return;

    const bounds = routeBounds(routeCoordinates);
    if (!bounds) return;

    // Record the route as framed only once there is a camera to frame it
    // with. Recording it first would mark an unframed route done and leave it
    // sitting in the region-wide view this exists to fix.
    const camera = cameraRef.current;
    if (!camera) return;

    fittedKey.current = key;
    pendingFit.current = true;
    const duration = reducedMotion ? 0 : FIT_DURATION;

    if (isDegenerate(bounds)) {
      camera.setCamera({
        centerCoordinate: bounds.ne,
        zoomLevel: LOCATED_ZOOM,
        animationDuration: duration,
      });
      return;
    }

    camera.fitBounds(bounds.ne, bounds.sw, ROUTE_FIT_PADDING, duration);
    // `routeCoordinates` is covered by `key`, which is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraRef, key, followUser, reducedMotion]);

  const fitJustSettled = useCallback(() => {
    if (!pendingFit.current) return false;
    pendingFit.current = false;
    return true;
  }, []);

  return { fitJustSettled };
}
