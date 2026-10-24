/**
 * Fuel Range Warning (spec §7.3)
 *
 * "When estimated remaining range approaches next fuel stop, a non-intrusive
 * banner surfaces."
 *
 * The range itself is whatever the driver told us at the start of the trip —
 * the app has no access to the vehicle's fuel level — so everything here is an
 * estimate from one number and the distance driven since. Nothing warns at all
 * until that number is given (#203).
 *
 * The lookup is a local SQLite query over the fuel stations packaged with the
 * region (#200), so the banner works with no connectivity.
 */

import { getResourcesNearPoint } from "@/db/queries/resources";
import { projectOntoPolyline } from "@/utils/geo";

import type { LatLng, ResourcePoint } from "@bugrout/shared";

/** How far off the route a station may sit and still count as "on route". */
const FUEL_CORRIDOR_METERS = 8000; // ~5 miles

/**
 * Range that must be left over once the station is reached. Below this, the
 * banner surfaces: arriving at a pump on fumes is not a margin.
 */
const FUEL_SAFETY_MARGIN_METERS = 16000; // ~10 miles

/**
 * Radius searched around the driver for candidate stations. Comfortably past
 * any range at which the banner could fire, so the next station ahead is
 * always inside it.
 */
const FUEL_SEARCH_RADIUS_METERS = 150000; // ~93 miles

/** Degrees per metre of latitude; the resource query takes a degree radius. */
const METERS_TO_DEGREES = 1 / 111320;

/**
 * A fuel station on the route ahead of the driver.
 */
export interface FuelStopAhead {
  /** The station. */
  resource: ResourcePoint;
  /** Metres to it: along the route to its turn-off, then off the route. */
  distanceAhead: number;
}

/**
 * Range left from a starting range and the distance driven since.
 *
 * @param startRangeMeters - What the driver said they could drive.
 * @param distanceTravelledMeters - How far they have driven since.
 * @returns Metres of range left, never below zero.
 */
export function remainingRangeMeters(
  startRangeMeters: number,
  distanceTravelledMeters: number,
): number {
  return Math.max(0, startRangeMeters - distanceTravelledMeters);
}

/**
 * The first fuel station ahead of the driver on this route.
 *
 * A station is "ahead" when its turn-off is further along the route than the
 * driver is, and "on route" when it lies within `corridorMeters` of the line.
 * Distance to it is the drive along the route plus the detour off it, which is
 * what the driver actually has to cover.
 *
 * @param routeCoordinates - The route polyline.
 * @param position - Where the driver is now.
 * @param fuelPoints - Candidate stations, e.g. from {@link loadFuelPointsNear}.
 * @param corridorMeters - How far off the route a station may sit.
 * @returns The nearest station ahead, or `null` if there is none.
 */
export function findNextFuelStop(
  routeCoordinates: LatLng[],
  position: LatLng,
  fuelPoints: ResourcePoint[],
  corridorMeters: number = FUEL_CORRIDOR_METERS,
): FuelStopAhead | null {
  const here = projectOntoPolyline(position, routeCoordinates);
  if (!here) return null;

  let best: FuelStopAhead | null = null;
  let bestAlong = Infinity;

  for (const resource of fuelPoints) {
    const at = projectOntoPolyline(
      { lat: resource.lat, lng: resource.lng },
      routeCoordinates,
    );
    if (!at || at.offMeters > corridorMeters) continue;
    if (at.alongMeters <= here.alongMeters) continue;

    if (at.alongMeters < bestAlong) {
      bestAlong = at.alongMeters;
      best = {
        resource,
        distanceAhead: at.alongMeters - here.alongMeters + at.offMeters,
      };
    }
  }

  return best;
}

/**
 * Whether the fuel banner should be showing.
 *
 * @param rangeRemaining - Metres of range left, or `null` if none was given.
 * @param stop - The next station ahead, or `null` if there is none.
 * @param marginMeters - Range that must survive reaching the station.
 * @returns `true` when reaching the station would leave less than the margin.
 */
export function shouldWarnOnFuelRange(
  rangeRemaining: number | null,
  stop: FuelStopAhead | null,
  marginMeters: number = FUEL_SAFETY_MARGIN_METERS,
): boolean {
  if (rangeRemaining === null || !stop) return false;
  return rangeRemaining - stop.distanceAhead < marginMeters;
}

/**
 * Load fuel stations near a point from the local database.
 *
 * One bounded query rather than a walk of the whole route: only the next
 * station ahead matters, and it is always well inside
 * {@link FUEL_SEARCH_RADIUS_METERS}.
 *
 * @param position - Centre of the search.
 * @param radiusMeters - How far around it to look.
 * @returns The stations found; empty when the region packages none.
 */
export async function loadFuelPointsNear(
  position: LatLng,
  radiusMeters: number = FUEL_SEARCH_RADIUS_METERS,
): Promise<ResourcePoint[]> {
  return getResourcesNearPoint(
    position.lat,
    position.lng,
    radiusMeters * METERS_TO_DEGREES,
    "fuel",
  );
}
