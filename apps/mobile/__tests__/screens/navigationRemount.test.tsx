/**
 * The navigation screen starts guidance only for the trip the user started,
 * addressed by its own id, and never restarts it on a remount (#294).
 *
 * When GPS will not start, or is lost mid-trip, it says so and goes back
 * rather than showing guidance for a trip nothing is tracking (#300).
 *
 * Resume on the trip banner pushes this screen afresh; so does a
 * `bugrout://navigation/<id>` link arriving while the app is warm. Either used
 * to call NavigationController.start, resetting guidance to the departure
 * maneuver mid-drive, and a link could start a previewed route without Go.
 */

import { act, render } from "@testing-library/react-native";
import { Alert } from "react-native";

import NavigationScreen from "@/app/navigation/[routeId]";
import { useRouteStore } from "@/stores/useRouteStore";

import type { NavigationEvent } from "@/services/navigation/NavigationController";
import type { Route } from "@bugrout/shared";

const mockBack = jest.fn();
let mockRouteId: string | undefined;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ routeId: mockRouteId }),
}));

const mockStart = jest
  .fn<Promise<void>, [Route, unknown]>()
  .mockResolvedValue(undefined);
const mockUpdateRoute = jest.fn();
let mockActive = false;
jest.mock("@/services/navigation/NavigationController", () => ({
  start: (route: Route, onEvent: unknown) => {
    mockActive = true;
    return mockStart(route, onEvent);
  },
  stop: () => {
    mockActive = false;
    return Promise.resolve();
  },
  isActive: () => mockActive,
  updateRoute: (...args: unknown[]) => mockUpdateRoute(...args) as unknown,
}));

jest.mock("@/components/navigation/RouteBody", () => ({
  RouteBody: () => null,
}));
jest.mock("@/hooks/useBattery", () => ({
  useBattery: () => ({ level: null, isCharging: false }),
}));
jest.mock("@/hooks/useFuelRange", () => ({
  useFuelRange: () => ({ stop: null, rangeRemaining: null, warn: false }),
}));
jest.mock("@/db/queries/preferences", () => ({
  getEmergencyContacts: () => Promise.resolve([]),
}));

const ROUTE: Route = {
  id: "0b6f6c55-3f0b-4f3c-9a55-2d1f4c3b2a10",
  summary: "via Route 1",
  geometry: "",
  coordinates: [
    { lat: 39.0, lng: -76.6 },
    { lat: 39.1, lng: -76.6 },
  ],
  distance: 11000,
  duration: 600,
  legs: [
    {
      distance: 11000,
      duration: 600,
      maneuvers: [
        {
          type: "depart",
          instruction: "Head north on Route 1",
          streetName: "Route 1",
          distance: 11000,
          duration: 600,
          position: { lat: 39.0, lng: -76.6 },
          bearingAfter: 0,
        },
        {
          type: "arrive",
          instruction: "You have arrived",
          streetName: "",
          distance: 0,
          duration: 0,
          position: { lat: 39.1, lng: -76.6 },
          bearingAfter: 0,
        },
      ],
    },
  ],
};

beforeEach(() => {
  mockBack.mockReset();
  mockStart.mockClear();
  mockUpdateRoute.mockReset();
  mockActive = false;
  mockRouteId = ROUTE.id;
  useRouteStore.getState().clearRoute();
  useRouteStore.getState().setRoute(ROUTE);
  useRouteStore.getState().startNavigation();
});

describe("navigation screen mount (#294)", () => {
  it("starts the trip the user pressed Go on, once, without a reroute", async () => {
    await render(<NavigationScreen />);

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart.mock.calls[0]?.[0]).toBe(ROUTE);
    // Effect 2 used to treat the mount as a reroute: "Route updated", index 0.
    expect(mockUpdateRoute).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("does not start guidance for a link to some other route id", async () => {
    mockRouteId = "x";

    await render(<NavigationScreen />);

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockUpdateRoute).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  it("leaves a running trip alone on a link to some other route id", async () => {
    mockActive = true; // the trip is running under another screen instance
    mockRouteId = "x";

    await render(<NavigationScreen />);

    expect(mockStart).not.toHaveBeenCalled();
    // Treating the running trip as rerouted would say "Route updated" and
    // reset its guidance to the first maneuver.
    expect(mockUpdateRoute).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  it("does not start a route that is only being previewed", async () => {
    useRouteStore.getState().setStatus("previewing");

    await render(<NavigationScreen />);

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  it("does not reset guidance when remounted by Resume", async () => {
    const first = await render(<NavigationScreen />);
    await first.unmount(); // backing out stops the controller; the trip stays active

    await render(<NavigationScreen />);

    // The controller is started again (it resyncs to the driver's position on
    // its first fix), but the screen does not also push a "route update".
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockUpdateRoute).not.toHaveBeenCalled();
  });

  it("still hands a rerouted trip to the controller", async () => {
    await render(<NavigationScreen />);

    const rerouted = { ...ROUTE, id: "rerouted" };
    useRouteStore.getState().setStatus("rerouting");
    await act(() => {
      useRouteStore.getState().setRoute(rerouted);
    });

    expect(mockUpdateRoute).toHaveBeenCalledWith(rerouted);
  });
});

describe("navigation screen when location is unavailable (#300)", () => {
  let alertSpy: jest.SpyInstance<void, Parameters<typeof Alert.alert>>;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  /** Press the only button of the alert most recently shown. */
  function dismissAlert(): void {
    const buttons = alertSpy.mock.lastCall?.[2];
    buttons?.[0]?.onPress?.();
  }

  it("tells the driver and goes back when GPS will not start", async () => {
    mockStart.mockRejectedValueOnce(
      new Error("Location permission not granted"),
    );

    await render(<NavigationScreen />);

    expect(alertSpy).toHaveBeenCalledWith(
      "Location unavailable",
      expect.any(String),
      expect.any(Array),
    );
    expect(mockBack).not.toHaveBeenCalled();
    dismissAlert();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("stays quiet if the screen closed before GPS failed to start", async () => {
    let fail: (err: Error) => void = jest.fn();
    mockStart.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
    );

    const screen = await render(<NavigationScreen />);
    await screen.unmount();
    await act(async () => {
      fail(new Error("Location permission not granted"));
      await Promise.resolve();
    });

    // Going back now would pop whatever screen replaced this one.
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("tells the driver and goes back when tracking is lost mid-trip", async () => {
    await render(<NavigationScreen />);
    const onEvent = mockStart.mock.calls[0]?.[1] as (
      event: NavigationEvent,
    ) => void;

    await act(() => {
      onEvent({ type: "tracking_lost" });
    });

    expect(alertSpy).toHaveBeenCalledWith(
      "Location unavailable",
      expect.any(String),
      expect.any(Array),
    );
    dismissAlert();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
