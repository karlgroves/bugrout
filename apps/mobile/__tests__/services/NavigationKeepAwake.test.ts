/**
 * Keep-awake through the real NavigationController lifecycle (#198).
 *
 * Spec §7.1: "Screen stays on only when navigating." The screen must not
 * auto-lock mid-trip, and must lock normally again once the trip is over,
 * whether it ends by Stop or by arrival.
 */

import * as NavController from "@/services/navigation/NavigationController";

import type { LocationCallback } from "@/services/location/LocationTracker";
import type { LatLng, Route } from "@bugrout/shared";

const mockActivate = jest.fn<Promise<void>, [string]>();
const mockDeactivate = jest.fn<Promise<void>, [string]>();
let mockOnLocation: LocationCallback | null = null;

jest.mock("@/platform/keepAwake", () => ({
  activate: (tag: string) => mockActivate(tag),
  deactivate: (tag: string) => mockDeactivate(tag),
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
  hasDeviated: () => false,
}));

const START: LatLng = { lat: 39.29, lng: -76.61 };
const END: LatLng = { lat: 39.3, lng: -76.6 };

const route: Route = {
  id: "keep-awake",
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
  mockActivate.mockReset().mockResolvedValue(undefined);
  mockDeactivate.mockReset().mockResolvedValue(undefined);
  mockOnLocation = null;
});

afterEach(async () => {
  await NavController.stop();
});

describe("NavigationController keep-awake", () => {
  it("keeps the screen awake from the start of navigation", async () => {
    await NavController.start(route, jest.fn());

    expect(mockActivate).toHaveBeenCalledTimes(1);
    expect(mockDeactivate).not.toHaveBeenCalled();
  });

  it("releases it, with the same tag, when navigation stops", async () => {
    await NavController.start(route, jest.fn());
    await NavController.stop();

    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    expect(mockDeactivate.mock.calls[0]?.[0]).toBe(
      mockActivate.mock.calls[0]?.[0],
    );
  });

  it("releases it on arrival, before the user dismisses the alert", async () => {
    const onEvent = jest.fn();
    await NavController.start(route, onEvent);

    await fixAt(START); // passes the depart maneuver
    expect(mockDeactivate).not.toHaveBeenCalled();
    await fixAt(END); // reaches the last maneuver

    expect(onEvent).toHaveBeenCalledWith({ type: "arrival" });
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
  });

  it("does nothing when stop is called with no trip running", async () => {
    await NavController.stop();

    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockDeactivate).not.toHaveBeenCalled();
  });
});
