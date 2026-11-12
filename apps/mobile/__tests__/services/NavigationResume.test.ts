/**
 * Navigation that (re)starts mid-trip picks up guidance where the driver is
 * (#294).
 *
 * Backing out of the navigation screen stops the controller while the trip
 * stays active, and Resume on the trip banner starts it again. Guidance used
 * to restart at the departure maneuver, and because a maneuver only advances
 * when the driver comes within 30 m of it, it never advanced again.
 */

import * as NavController from "@/services/navigation/NavigationController";

import type { LocationCallback } from "@/services/location/LocationTracker";
import type { NavigationEvent } from "@/services/navigation/NavigationController";
import type { LatLng, Route, RouteManeuver } from "@bugrout/shared";

let mockOnLocation: LocationCallback | null = null;
const mockSpeak = jest.fn<undefined, [string]>();
const mockTrack = jest.fn<undefined, [string]>();

jest.mock("@/platform/keepAwake", () => ({
  activate: () => Promise.resolve(),
  deactivate: () => Promise.resolve(),
}));
jest.mock("@/services/location/LocationTracker", () => ({
  startTracking: (cb: LocationCallback) => {
    mockOnLocation = cb;
    return Promise.resolve();
  },
  startBatterySavingTracking: () => Promise.resolve(),
  stopTracking: () => Promise.resolve(),
}));
jest.mock("@/platform/speech", () => ({
  speak: (text: string) => {
    mockSpeak(text);
  },
  stop: jest.fn(),
}));
jest.mock("@/platform/haptics", () => ({
  selection: jest.fn(),
  notification: jest.fn(),
}));
jest.mock("@/platform/analytics", () => ({
  track: (name: string) => {
    mockTrack(name);
  },
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
  id: "resume-trip",
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

/** The maneuver indexes a handler was told guidance advanced to, in order. */
function advances(onEvent: jest.Mock<undefined, [NavigationEvent]>): number[] {
  return onEvent.mock.calls.flatMap(([event]) =>
    event.type === "maneuver_advance" ? [event.index] : [],
  );
}

/** Between B and C: past "Continue past the bridge", before the turn. */
const PAST_B: LatLng = { lat: 39.15, lng: -76.6 };

beforeEach(() => {
  mockOnLocation = null;
  mockSpeak.mockReset();
  mockTrack.mockReset();
});

afterEach(async () => {
  await NavController.stop();
});

describe("NavigationController resuming mid-trip (#294)", () => {
  it("moves past the departure maneuver once the driver is past it", async () => {
    const onEvent = jest.fn<undefined, [NavigationEvent]>();
    await NavController.start(route, onEvent);

    await fixAt({ lat: 39.05, lng: -76.6 }); // half way to B
    // The first fix is past the depart point, so guidance moves to B.
    expect(advances(onEvent)).toEqual([1]);
  });

  it("keeps the departure maneuver at the origin itself", async () => {
    const onEvent = jest.fn<undefined, [NavigationEvent]>();
    await NavController.start(route, onEvent);

    await fixAt({ lat: 39.0, lng: -76.6005 }); // ~40 m west of A, not passed

    expect(advances(onEvent)).toEqual([]);
  });

  it("moves guidance to the next maneuver ahead when restarted mid-trip", async () => {
    const onEvent = jest.fn<undefined, [NavigationEvent]>();
    await NavController.start(route, onEvent);

    await fixAt(PAST_B);

    expect(advances(onEvent)).toEqual([2]);
  });

  it("keeps advancing normally after the resync", async () => {
    const onEvent = jest.fn<undefined, [NavigationEvent]>();
    await NavController.start(route, onEvent);

    await fixAt(PAST_B);
    await fixAt(C); // reaches the turn

    expect(advances(onEvent)).toEqual([2, 3]);

    await fixAt(D);
    expect(onEvent).toHaveBeenCalledWith({ type: "arrival" });
  });

  it("does not restart a trip that is already running on the same route", async () => {
    const first = jest.fn<undefined, [NavigationEvent]>();
    await NavController.start(route, first);
    await fixAt(PAST_B);
    mockSpeak.mockReset();
    mockTrack.mockReset();

    const second = jest.fn<undefined, [NavigationEvent]>();
    await NavController.start(route, second);
    await fixAt({ lat: 39.16, lng: -76.6 });

    // No second departure announcement or ROUTE_STARTED, and the new handler
    // is told where guidance already is rather than starting from zero.
    expect(mockSpeak).not.toHaveBeenCalledWith("Head north on Route 1");
    expect(mockTrack).not.toHaveBeenCalled();
    expect(advances(second)).toEqual([2]);
    expect(NavController.isActive()).toBe(true);
  });

  it("resyncs after a reroute too", async () => {
    const onEvent = jest.fn<undefined, [NavigationEvent]>();
    await NavController.start(route, onEvent);
    await fixAt({ lat: 39.0, lng: -76.6005 });

    NavController.updateRoute({ ...route, id: "rerouted" });
    await fixAt(PAST_B);

    expect(advances(onEvent)).toEqual([2]);
  });
});
