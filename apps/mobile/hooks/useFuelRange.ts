/**
 * Hook tracking fuel range against the next station on the route (#203).
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  findNextFuelStop,
  loadFuelPointsNear,
  remainingRangeMeters,
  shouldWarnOnFuelRange,
  type FuelStopAhead,
} from "@/services/navigation/FuelRange";
import { useRouteStore } from "@/stores/useRouteStore";
import { haversineDistance } from "@/utils/geo";

import type { LatLng, ResourcePoint, Route } from "@bugrout/shared";

/**
 * How far the driver has to move before the station list is fetched again.
 * Well under the search radius, so the list always covers the road ahead.
 */
const REFETCH_AFTER_METERS = 20000; // ~12 miles

/**
 * Movement below this is treated as GPS noise and burns no fuel. A stationary
 * phone reports a position that wanders by a few metres, and without a floor
 * a car waiting in evacuation traffic would run itself dry on paper.
 */
const JITTER_FLOOR_METERS = 10;

/**
 * What {@link useFuelRange} reports to the navigation screen.
 */
export interface FuelRangeState {
  /** The next station ahead on the route, or `null` if there is none. */
  stop: FuelStopAhead | null;
  /** Metres of range left, or `null` when the driver gave no range. */
  rangeRemaining: number | null;
  /** Whether the banner should be showing. */
  warn: boolean;
}

/**
 * Track the driver's remaining range against the next fuel station ahead.
 *
 * Reports nothing to warn about until a range was given at trip start: with no
 * number from the driver there is nothing to estimate from, and a guess is
 * worse than silence in an evacuation.
 *
 * The distance driven is accumulated from the GPS positions themselves rather
 * than read off progress along the route. Progress along the route is the
 * tempting measure and it is wrong: a reroute hands over a new route that
 * starts where the driver is, so progress along it returns to zero, and the
 * range would climb back up every time the trip was recalculated.
 *
 * @param route - The active route, or `null` before one is set.
 * @param position - The driver's current position.
 * @returns The next stop, the range left, and whether to warn.
 */
export function useFuelRange(
  route: Route | null,
  position: LatLng | null,
): FuelRangeState {
  const fuelRangeMeters = useRouteStore((s) => s.fuelRangeMeters);
  const [fuelPoints, setFuelPoints] = useState<ResourcePoint[]>([]);
  const [travelledMeters, setTravelledMeters] = useState(0);

  const lastPosition = useRef<LatLng | null>(null);
  const fetchedFrom = useRef<LatLng | null>(null);
  const fetching = useRef(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // Distance driven, from the positions as they arrive.
  useEffect(() => {
    if (!position) return;
    const previous = lastPosition.current;
    lastPosition.current = position;
    if (!previous) return;

    const step = haversineDistance(previous, position);
    if (step < JITTER_FLOOR_METERS) {
      // Hold the old anchor, or a slow drift of sub-floor steps would never
      // accumulate at all.
      lastPosition.current = previous;
      return;
    }
    setTravelledMeters((driven) => driven + step);
  }, [position]);

  // Stations come from the region's own database, so this works offline.
  //
  // Deliberately not cancelled when the position changes, and the anchor below
  // moves only once a lookup has succeeded. Cancelling on change while marking
  // the anchor up front meant a lookup overtaken by the next GPS tick, or one
  // that simply failed, was never retried until the driver had covered another
  // 20 km — with no station list, and so no banner, for that whole stretch.
  useEffect(() => {
    if (fuelRangeMeters === null || !position) return;
    if (fetching.current) return;

    const anchor = fetchedFrom.current;
    if (anchor && haversineDistance(anchor, position) < REFETCH_AFTER_METERS) {
      return;
    }

    const from = position;
    fetching.current = true;
    void loadFuelPointsNear(from)
      .then((points) => {
        // The anchor moves only on success, so a failed lookup is retried on
        // the next tick instead of being locked out for 20 km.
        if (!mounted.current) return;
        fetchedFrom.current = from;
        setFuelPoints(points);
      })
      .catch(() => {
        // No fuel data for this region is a quiet "no banner", not an error
        // worth interrupting navigation for.
        if (mounted.current) setFuelPoints([]);
      })
      .finally(() => {
        fetching.current = false;
      });
  }, [fuelRangeMeters, position]);

  return useMemo(() => {
    if (fuelRangeMeters === null || !route || !position) {
      return { stop: null, rangeRemaining: null, warn: false };
    }

    const rangeRemaining = remainingRangeMeters(
      fuelRangeMeters,
      travelledMeters,
    );
    const stop = findNextFuelStop(route.coordinates, position, fuelPoints);

    return {
      stop,
      rangeRemaining,
      warn: shouldWarnOnFuelRange(rangeRemaining, stop),
    };
  }, [fuelRangeMeters, route, position, travelledMeters, fuelPoints]);
}
