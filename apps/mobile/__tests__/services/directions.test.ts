/**
 * The directions list as data (#192): every maneuver across every leg, the
 * distance and time to reach it, and the clock time it will be reached.
 *
 * A Valhalla maneuver's distance and time cover the stretch *after* it, so a
 * step is reached after the previous step's distance and time. Getting that
 * backwards would put every clock time one stretch out.
 */

import {
  arrivalTimes,
  buildDirections,
  secondsToStep,
} from "@/services/navigation/directions";

import type { Route, RouteManeuver } from "@bugrout/shared";

/** A maneuver whose following stretch is `metres` long and takes `seconds`. */
function m(
  instruction: string,
  metres: number,
  seconds: number,
  type = "continue",
): RouteManeuver {
  return {
    type,
    instruction,
    streetName: "",
    distance: metres,
    duration: seconds,
    position: { lat: 0, lng: 0 },
    bearingAfter: 0,
  };
}

/** Two legs: depart, turn, stop at a fuel station; depart, arrive. */
const route: Route = {
  id: "r",
  summary: "",
  geometry: "",
  coordinates: [],
  distance: 3500,
  duration: 330,
  legs: [
    {
      distance: 2000,
      duration: 180,
      maneuvers: [
        m("Head north", 1500, 120, "depart"),
        m("Turn right", 500, 60, "turn-right"),
        m("Arrive at your stop", 0, 0, "arrive"),
      ],
    },
    {
      distance: 1500,
      duration: 150,
      maneuvers: [
        m("Head east", 1500, 150, "depart"),
        m("You have arrived", 0, 0, "arrive"),
      ],
    },
  ],
};

describe("buildDirections", () => {
  const steps = buildDirections(route);

  it("lists every maneuver of every leg, in order, indexed like the controller", () => {
    expect(steps.map((s) => s.maneuver.instruction)).toEqual([
      "Head north",
      "Turn right",
      "Arrive at your stop",
      "Head east",
      "You have arrived",
    ]);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("reaches each step after the previous step's stretch", () => {
    expect(steps.map((s) => s.distanceFromPrevious)).toEqual([
      0, 1500, 500, 0, 1500,
    ]);
    expect(steps.map((s) => s.distanceFromStart)).toEqual([
      0, 1500, 2000, 2000, 3500,
    ]);
    expect(steps.map((s) => s.secondsFromStart)).toEqual([
      0, 120, 180, 180, 330,
    ]);
  });

  it("marks the resource stop between legs, and the arrival at the end", () => {
    expect(steps.map((s) => s.isStop)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
    expect(steps.map((s) => s.isArrival)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});

describe("arrivalTimes", () => {
  const steps = buildDirections(route);
  const NOW = Date.UTC(2026, 9, 5, 13, 0, 0);

  it("before the trip: the departure plus each step's time from the start", () => {
    expect(arrivalTimes(steps, NOW)).toEqual([
      NOW,
      NOW + 120_000,
      NOW + 180_000,
      NOW + 180_000,
      NOW + 330_000,
    ]);
  });

  it("during the trip: passed steps have none; later ones are re-based on now", () => {
    // Driving towards step 3 (Head east), 30 s from it.
    expect(arrivalTimes(steps, NOW, 3, 30)).toEqual([
      null,
      null,
      null,
      NOW + 30_000,
      NOW + 30_000 + 150_000,
    ]);
  });
});

describe("secondsToStep", () => {
  const steps = buildDirections(route);

  it("scales the planned time of the stretch by the distance left", () => {
    // Towards step 1 (Turn right): the stretch before it is 1500 m in 120 s.
    expect(secondsToStep(steps, 1, 750)).toBe(60);
  });

  it("is 0 before the first step and on a zero-length stretch", () => {
    expect(secondsToStep(steps, 0, 100)).toBe(0);
    expect(secondsToStep(steps, 3, 100)).toBe(0);
  });
});
