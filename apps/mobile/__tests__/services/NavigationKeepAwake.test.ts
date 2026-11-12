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
const mockStartTracking = jest.fn<Promise<void>, []>();
const mockStartBatterySaving = jest.fn<Promise<void>, []>();
const mockStopTracking = jest.fn<Promise<void>, []>();
let mockOnLocation: LocationCallback | null = null;

jest.mock("@/platform/keepAwake", () => ({
  activate: (tag: string) => mockActivate(tag),
  deactivate: (tag: string) => mockDeactivate(tag),
}));
jest.mock("@/services/location/LocationTracker", () => ({
  startTracking: (cb: LocationCallback) => {
    mockOnLocation = cb;
    return mockStartTracking();
  },
  startBatterySavingTracking: () => mockStartBatterySaving(),
  stopTracking: () => mockStopTracking(),
}));
jest.mock("@/services/CrashReporting", () => ({ captureError: jest.fn() }));
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

/** Let pending promise callbacks run. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Feed one GPS fix at `position` and let the async handler finish. */
async function fixAt(position: LatLng): Promise<void> {
  mockOnLocation?.({
    position,
    heading: 0,
    speed: 10,
    accuracy: 5,
    timestamp: Date.now(),
  });
  await flush();
}

/** A promise the test settles by hand, to hold GPS start-up mid-flight. */
function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
} {
  let settle: { resolve: () => void; reject: (err: Error) => void } = {
    resolve: jest.fn(),
    reject: jest.fn(),
  };
  const promise = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject };
  });
  return {
    promise,
    resolve: () => {
      settle.resolve();
    },
    reject: (err) => {
      settle.reject(err);
    },
  };
}

const secondRoute: Route = { ...route, id: "second-trip" };

beforeEach(() => {
  mockActivate.mockReset().mockResolvedValue(undefined);
  mockDeactivate.mockReset().mockResolvedValue(undefined);
  mockStartTracking.mockReset().mockResolvedValue(undefined);
  mockStartBatterySaving.mockReset().mockResolvedValue(undefined);
  mockStopTracking.mockReset().mockResolvedValue(undefined);
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

  it("ends the trip on arrival, so a later fix does not arrive again (#300)", async () => {
    const onEvent = jest.fn();
    await NavController.start(route, onEvent);

    await fixAt(START);
    await fixAt(END);
    await fixAt(END); // GPS delivers another fix before teardown is observed

    const arrivals = onEvent.mock.calls.filter(
      ([event]) => (event as { type: string }).type === "arrival",
    );
    expect(arrivals).toHaveLength(1);
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    expect(mockStopTracking).toHaveBeenCalled();
    expect(NavController.isActive()).toBe(false);
  });

  it("releases it and rejects when GPS will not start (#300)", async () => {
    mockStartTracking.mockRejectedValue(
      new Error("Location permission not granted"),
    );

    await expect(NavController.start(route, jest.fn())).rejects.toThrow(
      "Location permission not granted",
    );
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    expect(NavController.isActive()).toBe(false);
  });

  it("keeps tracking in the old mode when a GPS mode switch fails (#300)", async () => {
    const onEvent = jest.fn();
    await NavController.start(route, onEvent);
    await fixAt(START); // passes depart; next maneuver is ~1.4 km away
    mockStartBatterySaving.mockRejectedValue(new Error("unavailable"));

    await fixAt(START); // far from the next turn: switch to battery saving

    expect(mockStartBatterySaving).toHaveBeenCalledTimes(1);
    expect(mockStartTracking).toHaveBeenCalledTimes(2); // start + restore
    expect(NavController.isActive()).toBe(true);
    expect(mockDeactivate).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalledWith({ type: "tracking_lost" });
  });

  it("ends the trip loudly when GPS cannot be restarted (#300)", async () => {
    const onEvent = jest.fn();
    await NavController.start(route, onEvent);
    await fixAt(START);
    mockStartBatterySaving.mockRejectedValue(new Error("unavailable"));
    mockStartTracking.mockRejectedValue(new Error("unavailable"));

    await fixAt(START);

    expect(onEvent).toHaveBeenCalledWith({ type: "tracking_lost" });
    expect(mockDeactivate).toHaveBeenCalledTimes(1);
    expect(NavController.isActive()).toBe(false);
  });

  it("stops GPS even if releasing keep-awake fails (#300)", async () => {
    await NavController.start(route, jest.fn());
    mockDeactivate.mockRejectedValue(new Error("no wake lock"));

    await NavController.stop();

    expect(mockStopTracking).toHaveBeenCalled();
    expect(NavController.isActive()).toBe(false);
  });

  it("stops a restored GPS subscription if the trip ended during the restore (#300)", async () => {
    await NavController.start(route, jest.fn());
    await fixAt(START);
    const restore = deferred();
    mockStartBatterySaving.mockRejectedValue(new Error("unavailable"));
    mockStartTracking.mockReturnValueOnce(restore.promise);
    await fixAt(START); // switch fails; restore to high frequency is pending

    await NavController.stop();
    const stopsBeforeRestore = mockStopTracking.mock.calls.length;
    restore.resolve();
    await flush();

    expect(mockStopTracking).toHaveBeenCalledTimes(stopsBeforeRestore + 1);
  });

  it("leaves a newer trip's GPS running when an old trip's restore succeeds (#300)", async () => {
    await NavController.start(route, jest.fn());
    await fixAt(START);
    const restore = deferred();
    mockStartBatterySaving.mockRejectedValue(new Error("unavailable"));
    mockStartTracking.mockReturnValueOnce(restore.promise);
    await fixAt(START);

    await NavController.stop();
    await NavController.start(secondRoute, jest.fn());
    const stopsBeforeRestore = mockStopTracking.mock.calls.length;
    restore.resolve();
    await flush();

    expect(mockStopTracking).toHaveBeenCalledTimes(stopsBeforeRestore);
    expect(NavController.isActive()).toBe(true);
  });

  it("does not end a newer trip when an old trip's GPS restore fails (#300)", async () => {
    await NavController.start(route, jest.fn());
    await fixAt(START);
    const restore = deferred();
    mockStartBatterySaving.mockRejectedValue(new Error("unavailable"));
    mockStartTracking.mockReturnValueOnce(restore.promise);
    await fixAt(START);

    await NavController.stop();
    const onSecond = jest.fn();
    await NavController.start(secondRoute, onSecond);
    restore.reject(new Error("unavailable"));
    await flush();

    expect(onSecond).not.toHaveBeenCalledWith({ type: "tracking_lost" });
    expect(NavController.isActive()).toBe(true);
  });

  it("stops GPS and skips the departure if the trip ended while GPS started (#300)", async () => {
    const { speak } = jest.requireMock<{ speak: jest.Mock }>(
      "@/platform/speech",
    );
    speak.mockClear();
    const gps = deferred();
    mockStartTracking.mockReturnValueOnce(gps.promise);
    const starting = NavController.start(route, jest.fn());
    await flush();

    await NavController.stop();
    const stopsBeforeStart = mockStopTracking.mock.calls.length;
    gps.resolve();
    await starting;

    expect(mockStopTracking).toHaveBeenCalledTimes(stopsBeforeStart + 1);
    expect(speak).not.toHaveBeenCalled();
    expect(NavController.isActive()).toBe(false);
  });

  it("leaves a newer trip's GPS running when an old trip's GPS starts late (#300)", async () => {
    const gps = deferred();
    mockStartTracking.mockReturnValueOnce(gps.promise);
    const starting = NavController.start(route, jest.fn());
    await flush();

    await NavController.stop();
    await NavController.start(secondRoute, jest.fn());
    const stopsBeforeStart = mockStopTracking.mock.calls.length;
    gps.resolve();
    await starting;

    expect(mockStopTracking).toHaveBeenCalledTimes(stopsBeforeStart);
    expect(NavController.isActive()).toBe(true);
  });

  it("does not end a newer trip when an old trip's GPS start fails (#300)", async () => {
    const gps = deferred();
    mockStartTracking.mockReturnValueOnce(gps.promise);
    const starting = NavController.start(route, jest.fn());
    await flush();

    await NavController.stop();
    await NavController.start(secondRoute, jest.fn());
    gps.reject(new Error("Location permission not granted"));

    await expect(starting).rejects.toThrow("Location permission not granted");
    expect(NavController.isActive()).toBe(true);
    expect(mockDeactivate).toHaveBeenCalledTimes(1); // the stop() only
  });

  it("does nothing when stop is called with no trip running", async () => {
    await NavController.stop();

    expect(mockActivate).not.toHaveBeenCalled();
    expect(mockDeactivate).not.toHaveBeenCalled();
  });
});
