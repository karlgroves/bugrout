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
 * @param route - The active route, or `null` before one is set.
 * @param position - The driver's current position.
 * @param remainingDistance - Metres left on the route, from `estimateRemaining`.
 * @returns The next stop, the range left, and whether to warn.
 */
export function useFuelRange(
  route: Route | null,
  position: LatLng | null,
  remainingDistance: number,
): FuelRangeState {
  const fuelRangeMeters = useRouteStore((s) => s.fuelRangeMeters);
  const [fuelPoints, setFuelPoints] = useState<ResourcePoint[]>([]);
  const fetchedAt = useRef<LatLng | null>(null);

  // Stations come from the region's own database, so this works offline. The
  // list is refetched only once the driver has moved a good way, rather than
  // on every GPS tick.
  useEffect(() => {
    if (fuelRangeMeters === null || !position) return;

    const last = fetchedAt.current;
    if (last && haversineDistance(last, position) < REFETCH_AFTER_METERS) {
      return;
    }

    let cancelled = false;
    fetchedAt.current = position;
    void loadFuelPointsNear(position)
      .then((points) => {
        if (!cancelled) setFuelPoints(points);
      })
      .catch(() => {
        // No fuel data for this region is a quiet "no banner", not an error
        // worth interrupting navigation for.
        if (!cancelled) setFuelPoints([]);
      });

    return () => {
      cancelled = true;
    };
  }, [fuelRangeMeters, position]);

  return useMemo(() => {
    if (fuelRangeMeters === null || !route || !position) {
      return { stop: null, rangeRemaining: null, warn: false };
    }

    const travelled = Math.max(0, route.distance - remainingDistance);
    const rangeRemaining = remainingRangeMeters(fuelRangeMeters, travelled);
    const stop = findNextFuelStop(route.coordinates, position, fuelPoints);

    return {
      stop,
      rangeRemaining,
      warn: shouldWarnOnFuelRange(rangeRemaining, stop),
    };
  }, [fuelRangeMeters, route, position, remainingDistance, fuelPoints]);
}
