/**
 * A trip that two callers are following ends only when the last one lets go
 * (#345).
 *
 * Two navigation screens can be mounted for one trip: a
 * `bugrout://navigation/<id>` link to the running trip pushes a second instance
 * over the first. Each stopped the controller when it unmounted, so closing
 * either one ended GPS, keep-awake and guidance for the one still on screen.
 */

import * as NavController from "@/services/navigation/NavigationController";

import type { LocationCallback } from "@/services/location/LocationTracker";
import type { NavigationEvent } from "@/services/navigation/NavigationController";
import type { LatLng, Route, RouteManeuver } from "@bugrout/shared";

let mockOnLocation: LocationCallback | null = null;
const mockStopTracking = jest.fn<undefined, []>();
const mockDeactivate = jest.fn<undefined, []>();

jest.mock("@/platform/keepAwake", () => ({
  activate: () => Promise.resolve(),
  deactivate: () => {
    mockDeactivate();
    return Promise.resolve();
  },
}));
jest.mock("@/services/location/LocationTracker", () => ({
  startTracking: (cb: LocationCallback) => {
    mockOnLocation = cb;
    return Promise.resolve();
  },
  startBatterySavingTracking: () => Promise.resolve(),
  stopTracking: () => {
    mockStopTracking();
    return Promise.resolve();
  },
}));
jest.mock("@/platform/speech", () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock("@/platform/haptics", () => ({
  selection: jest.fn(),
  notification: jest.fn(),
}));
jest.mock("@/platform/analytics", () => ({
  track: jest.fn(),
  Events: { ROUTE_STARTED: "route_started" },
}));
jest.mock("@/services/crowd/CrowdSignal", () => ({ sendSignal: jest.fn() }));
jest.mock("@/services/routing/RouteEngine", () => ({
  hasDeviated: () => false,
}));

/** A straight road north, about 11 km between each maneuver. */
const A: LatLng = { lat: 39.0, lng: -76.6 };
const B: LatLng = { lat: 39.1, lng: -76.6 };
const C: LatLng = { lat: 39.2, lng: -76.6 };
const D: LatLng = { lat: 39.3, lng: -76.6 };

/** Between B and C: past "Continue past the bridge", before the turn. */
const PAST_B: LatLng = { lat: 39.15, lng: -76.6 };

function maneuver(
  type: string,
  instruction: string,
  at: LatLng,
): RouteManeuver {
  return {
    type,
    instruction,
    streetName: "Route 1",
    distance: 11000,
    duration: 600,
    position: at,
    bearingAfter: 0,
  };
}

const route: Route = {
  id: "shared-trip",
  summary: "via Route 1",
  geometry: "",
  coordinates: [A, B, C, D],
  distance: 33000,
  duration: 1800,
  legs: [
    {
      distance: 33000,
      duration: 1800,
      maneuvers: [
        maneuver("depart", "Head north on Route 1", A),
        maneuver("continue", "Continue past the bridge", B),
        maneuver("turn-right", "Turn right onto Oak Ave", C),
        maneuver("arrive", "You have arrived", D),
      ],
    },
  ],
};

type Handler = jest.Mock<undefined, [NavigationEvent]>;

/** A caller's event handler that records what it is sent. */
function handler(): Handler {
  return jest.fn<undefined, [NavigationEvent]>();
}

/** Feed one GPS fix at `position` and let the async handler finish. */
async function fixAt(position: LatLng): Promise<void> {
  mockOnLocation?.({
    position,
    heading: 0,
    speed: 25,
    accuracy: 5,
    timestamp: Date.now(),
  });
  await new Promise((resolve) => setImmediate(resolve));
}

/** How many GPS fixes a handler has been given. */
function fixesSeen(onEvent: Handler): number {
  return onEvent.mock.calls.filter(([event]) => event.type === "position")
    .length;
}

/** The maneuver indexes a handler was told guidance had reached, in order. */
function advances(onEvent: Handler): number[] {
  return onEvent.mock.calls.flatMap(([event]) =>
    event.type === "maneuver_advance" ? [event.index] : [],
  );
}

/** Two callers following one running trip, the second on top of the first. */
async function startShared(): Promise<{ first: Handler; second: Handler }> {
  const first = handler();
  const second = handler();
  await NavController.start(route, first);
  await NavController.start(route, second);
  return { first, second };
}

beforeEach(() => {
  mockOnLocation = null;
  mockStopTracking.mockReset();
  mockDeactivate.mockReset();
});

afterEach(async () => {
  await NavController.stop();
});

describe("NavigationController with two followers of one trip (#345)", () => {
  it("keeps guiding the first when the second lets go", async () => {
    const { first, second } = await startShared();
    await fixAt(PAST_B);
    expect(fixesSeen(second)).toBe(1);
    // Far from the next maneuver, that fix moved GPS to battery-saving mode,
    // which restarts the subscription. Count only what release() does.
    mockStopTracking.mockReset();

    await NavController.release(second);

    expect(NavController.isActive()).toBe(true);
    expect(mockStopTracking).not.toHaveBeenCalled();
    expect(mockDeactivate).not.toHaveBeenCalled();

    await fixAt({ lat: 39.16, lng: -76.6 });
    expect(fixesSeen(first)).toBe(1);
    expect(fixesSeen(second)).toBe(1);
  });

  it("tells the first where guidance has reached when it takes over", async () => {
    const { first, second } = await startShared();
    await fixAt(PAST_B); // the second is told guidance moved to maneuver 2
    expect(advances(first)).toEqual([]);

    await NavController.release(second);

    expect(advances(first)).toEqual([2]);
  });

  it("keeps guiding the second when the first lets go", async () => {
    const { first, second } = await startShared();

    await NavController.release(first);

    expect(NavController.isActive()).toBe(true);
    expect(mockStopTracking).not.toHaveBeenCalled();

    await fixAt(PAST_B);
    expect(fixesSeen(second)).toBe(1);
    expect(fixesSeen(first)).toBe(0);
  });

  it("ends the trip when the last follower lets go", async () => {
    const { first, second } = await startShared();

    await NavController.release(second);
    await NavController.release(first);

    expect(NavController.isActive()).toBe(false);
    expect(mockStopTracking).toHaveBeenCalledTimes(1);
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
  });

  it("ends the trip when its only follower lets go", async () => {
    const only = handler();
    await NavController.start(route, only);

    await NavController.release(only);

    expect(NavController.isActive()).toBe(false);
    expect(mockStopTracking).toHaveBeenCalledTimes(1);
  });

  it("sends each event to the newest follower only", async () => {
    const { first, second } = await startShared();

    await fixAt(PAST_B);
    await fixAt(C);
    await fixAt(D);

    // One arrival alert, on the screen in front.
    expect(second).toHaveBeenCalledWith({ type: "arrival" });
    expect(first).not.toHaveBeenCalledWith({ type: "arrival" });
  });

  it("still ends the trip for everyone on stop", async () => {
    const { first, second } = await startShared();

    await NavController.stop();
    await fixAt(PAST_B);

    expect(NavController.isActive()).toBe(false);
    expect(mockStopTracking).toHaveBeenCalledTimes(1);
    expect(fixesSeen(first) + fixesSeen(second)).toBe(0);
  });

  it("ignores a follower of a trip that was replaced by another route", async () => {
    const old = handler();
    await NavController.start(route, old);
    const current = handler();
    await NavController.start({ ...route, id: "another-trip" }, current);
    mockStopTracking.mockReset();

    await NavController.release(old);

    expect(NavController.isActive()).toBe(true);
    expect(mockStopTracking).not.toHaveBeenCalled();
  });

  it("counts a handler once however many times it starts the same trip", async () => {
    const onEvent = handler();
    await NavController.start(route, onEvent);
    await NavController.start(route, onEvent);

    await NavController.release(onEvent);

    expect(NavController.isActive()).toBe(false);
  });
});
