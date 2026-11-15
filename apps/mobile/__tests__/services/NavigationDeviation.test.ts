/**
 * The deviation flag tracks the condition on every GPS fix (#298).
 *
 * It used to be set on an off-route fix and never cleared, so one false
 * reading halted guidance and arrival detection for the rest of the trip.
 */

import * as NavController from "@/services/navigation/NavigationController";
import { useRouteStore } from "@/stores/useRouteStore";

import type { LocationCallback } from "@/services/location/LocationTracker";
import type { LatLng, Route } from "@bugrout/shared";

let mockOnLocation: LocationCallback | null = null;
let mockOffRoute = false;

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
jest.mock("@/platform/speech", () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock("@/platform/haptics", () => ({
  selection: jest.fn(),
  notification: jest.fn(),
}));
jest.mock("@/platform/analytics", () => ({
  track: jest.fn(),
  Events: {},
}));
jest.mock("@/services/crowd/CrowdSignal", () => ({ sendSignal: jest.fn() }));
jest.mock("@/services/routing/RouteEngine", () => ({
  hasDeviated: () => mockOffRoute,
}));

const START: LatLng = { lat: 39.29, lng: -76.61 };
const MID: LatLng = { lat: 39.295, lng: -76.605 };
const END: LatLng = { lat: 39.3, lng: -76.6 };

const route: Route = {
  id: "deviation",
  summary: "via Main St",
  geometry: "",
  coordinates: [START, END],
  distance: 1400,
  duration: 120,
  legs: [
    {
      distance: 1400,
      duration: 120,
      maneuvers: [
        {
          type: "depart",
          instruction: "Head north",
          streetName: "Main St",
          distance: 0,
          duration: 0,
          position: START,
          bearingAfter: 0,
        },
        {
          type: "arrive",
          instruction: "You have arrived",
          streetName: "Main St",
          distance: 1400,
          duration: 120,
          position: END,
          bearingAfter: 0,
        },
      ],
    },
  ],
};

/** Feed one GPS fix at `position` and let the async handler finish. */
async function fixAt(position: LatLng): Promise<void> {
  mockOnLocation?.({
    position,
    heading: 0,
    speed: 10,
    accuracy: 5,
    timestamp: Date.now(),
  });
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  mockOnLocation = null;
  mockOffRoute = false;
  useRouteStore.getState().clearRoute();
});

afterEach(async () => {
  await NavController.stop();
});

describe("NavigationController deviation flag", () => {
  it("sets the flag on an off-route fix and clears it once back on route", async () => {
    await NavController.start(route, jest.fn());

    mockOffRoute = true;
    await fixAt(MID);
    expect(useRouteStore.getState().hasDeviated).toBe(true);

    mockOffRoute = false;
    await fixAt(MID);
    expect(useRouteStore.getState().hasDeviated).toBe(false);
  });

  it("still reaches arrival after a transient deviation", async () => {
    const onEvent = jest.fn();
    await NavController.start(route, onEvent);

    await fixAt(START); // passes the depart maneuver
    mockOffRoute = true;
    await fixAt(MID);
    mockOffRoute = false;
    await fixAt(END);

    expect(onEvent).toHaveBeenCalledWith({ type: "arrival" });
  });
});
