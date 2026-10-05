/**
 * The turn-by-turn directions list, as data (#192).
 *
 * Each step is one maneuver from the route, in order, across every leg. A
 * Valhalla maneuver's `distance` and `duration` cover the stretch *after* it,
 * up to the next maneuver. So a step is reached after the previous step's
 * distance and time, and its clock time is the departure plus everything
 * before it.
 */

import type { Route, RouteManeuver } from "@bugrout/shared";

/** One row of the directions list. */
export interface DirectionStep {
  /** Position in the flattened maneuver list; NavigationController's index. */
  index: number;
  maneuver: RouteManeuver;
  /** Metres from the previous step to this one (0 for the first). */
  distanceFromPrevious: number;
  /** Metres from the start of the route to this step. */
  distanceFromStart: number;
  /** Seconds from the start of the route to this step. */
  secondsFromStart: number;
  /** A resource stop (fuel, water) between legs, not a turn. */
  isStop: boolean;
  /** The end of the route. */
  isArrival: boolean;
}

/**
 * Every maneuver of a route as a directions step, with running totals.
 *
 * @param route - The route to list.
 * @returns The steps, in driving order.
 */
export function buildDirections(route: Route): DirectionStep[] {
  const steps: DirectionStep[] = [];
  let distanceFromStart = 0;
  let secondsFromStart = 0;
  let previous: RouteManeuver | null = null;

  route.legs.forEach((leg, legIndex) => {
    const lastLeg = legIndex === route.legs.length - 1;
    leg.maneuvers.forEach((maneuver, i) => {
      const distanceFromPrevious = previous ? previous.distance : 0;
      distanceFromStart += distanceFromPrevious;
      secondsFromStart += previous ? previous.duration : 0;
      const endOfLeg = i === leg.maneuvers.length - 1;
      steps.push({
        index: steps.length,
        maneuver,
        distanceFromPrevious,
        distanceFromStart,
        secondsFromStart,
        isStop: endOfLeg && !lastLeg,
        isArrival: endOfLeg && lastLeg,
      });
      previous = maneuver;
    });
  });

  return steps;
}

/**
 * When each step will be reached, as a clock time.
 *
 * Before the trip starts (`current` 0, nothing driven) this is the departure
 * plus each step's time from the start. During the trip it is re-based on now:
 * the time to the next step, then the planned time between later steps.
 *
 * @param steps - From {@link buildDirections}.
 * @param now - The current time, in ms since the epoch.
 * @param current - Index of the step being driven towards.
 * @param secondsToCurrent - Estimated time to reach `current` from here.
 * @returns Arrival times, in ms since the epoch, one per step; passed steps
 *   get `null`.
 */
export function arrivalTimes(
  steps: DirectionStep[],
  now: number,
  current = 0,
  secondsToCurrent = 0,
): (number | null)[] {
  const base = steps[current]?.secondsFromStart ?? 0;
  return steps.map((step) =>
    step.index < current
      ? null
      : now + (secondsToCurrent + step.secondsFromStart - base) * 1000,
  );
}

/**
 * Estimated seconds to reach the next maneuver from `metresToGo` away, at the
 * planned pace of the stretch leading to it.
 *
 * @param steps - From {@link buildDirections}.
 * @param current - Index of the step being driven towards.
 * @param metresToGo - Distance left to that step.
 * @returns Seconds; 0 when the stretch has no planned distance.
 */
export function secondsToStep(
  steps: DirectionStep[],
  current: number,
  metresToGo: number,
): number {
  const before = steps[current - 1];
  if (!before || before.maneuver.distance <= 0) return 0;
  return (metresToGo / before.maneuver.distance) * before.maneuver.duration;
}
