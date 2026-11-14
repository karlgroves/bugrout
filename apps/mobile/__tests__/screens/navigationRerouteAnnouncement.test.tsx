/**
 * A reroute says "Route updated" once (#344).
 *
 * The navigation screen used to hand a recalculated route to the controller
 * twice: once from the handler that calculated it, and again from the effect
 * that watches the trip's route id. Each hand-over speaks, so the driver heard
 * the prompt start, get cut off, and start again.
 *
 * The screen runs against the real NavigationController here, with speech and
 * GPS mocked, so the test counts what would reach the speaker.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";

import NavigationScreen from "@/app/navigation/[routeId]";
import { useRouteStore } from "@/stores/useRouteStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

import type { LocationCallback } from "@/services/location/LocationTracker";
import type { LatLng, Route } from "@bugrout/shared";

const ROUTE_ID = "reroute-announcement";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ routeId: "reroute-announcement" }),
}));

const mockSpeak = jest.fn<undefined, [string]>();
jest.mock("@/platform/speech", () => ({
  speak: (text: string) => {
    mockSpeak(text);
  },
  stop: jest.fn(),
}));

let mockOnLocation: LocationCallback | null = null;
jest.mock("@/services/location/LocationTracker", () => ({
  startTracking: (cb: LocationCallback) => {
    mockOnLocation = cb;
    return Promise.resolve();
  },
  startBatterySavingTracking: () => Promise.resolve(),
  stopTracking: () => Promise.resolve(),
}));

let mockOffRoute = false;
const mockCalculate = jest.fn<Promise<Route>, unknown[]>();
jest.mock("@/services/routing/RouteEngine", () => ({
  hasDeviated: () => mockOffRoute,
  estimateRemaining: () => ({ distance: 10000, duration: 540 }),
  calculateSmartRoute: (...args: unknown[]) => mockCalculate(...args),
}));

jest.mock("@/platform/keepAwake", () => ({
  activate: () => Promise.resolve(),
  deactivate: () => Promise.resolve(),
}));
jest.mock("@/platform/haptics", () => ({
  selection: jest.fn(),
  notification: jest.fn(),
}));
jest.mock("@/platform/analytics", () => ({ track: jest.fn(), Events: {} }));
jest.mock("@/services/CrashReporting", () => ({ captureError: jest.fn() }));
jest.mock("@/services/crowd/CrowdSignal", () => ({ sendSignal: jest.fn() }));

jest.mock("@/components/navigation/RouteBody", () => ({
  RouteBody: () => null,
}));
jest.mock("@/hooks/useBattery", () => ({
  useBattery: () => ({ level: null, isCharging: false }),
}));
jest.mock("@/hooks/useFuelRange", () => ({
  useFuelRange: () => ({
    stop: {
      resource: {
        id: "osm-1",
        type: "fuel",
        name: "Wawa, Route 40",
        lat: 39.05,
        lng: -76.6,
        address: null,
        metadata: {},
        source: "osm",
        fetchedAt: 0,
        regionId: "md",
      },
      distanceAhead: 5000,
    },
    rangeRemaining: 6000,
    warn: true,
  }),
}));
jest.mock("@/db/queries/preferences", () => ({
  getEmergencyContacts: () => Promise.resolve([]),
}));

const START: LatLng = { lat: 39.0, lng: -76.6 };
const END: LatLng = { lat: 39.1, lng: -76.6 };

/** A two-maneuver route from START to END under the given id. */
function routeWithId(id: string): Route {
  return {
    id,
    summary: "via Route 1",
    geometry: "",
    coordinates: [START, END],
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
            position: START,
            bearingAfter: 0,
          },
          {
            type: "arrive",
            instruction: "You have arrived",
            streetName: "",
            distance: 0,
            duration: 0,
            position: END,
            bearingAfter: 0,
          },
        ],
      },
    ],
  };
}

/** Feed one GPS fix just past the start and let the async handler finish. */
async function fix(): Promise<void> {
  await act(async () => {
    mockOnLocation?.({
      position: { lat: 39.01, lng: -76.6 },
      heading: 0,
      speed: 10,
      accuracy: 5,
      timestamp: Date.now(),
    });
    await new Promise((resolve) => setImmediate(resolve));
  });
}

/** How many times "Route updated" was sent to the speaker. */
function routeUpdatedCount(): number {
  return mockSpeak.mock.calls.filter(([text]) => text === "Route updated")
    .length;
}

beforeEach(() => {
  mockSpeak.mockClear();
  mockCalculate.mockReset();
  mockOnLocation = null;
  mockOffRoute = false;
  useSettingsStore.setState({ voiceEnabled: true });
  useRouteStore.getState().clearRoute();
  useRouteStore.getState().setRoute(routeWithId(ROUTE_ID));
  useRouteStore.getState().startNavigation();
});

describe("navigation screen reroute announcement (#344)", () => {
  it('says "Route updated" once when the driver recalculates', async () => {
    mockOffRoute = true; // the next fix is off route, so Recalculate is offered
    mockCalculate.mockResolvedValue(routeWithId("recalculated"));
    const view = await render(<NavigationScreen />);
    await fix();

    await fireEvent.press(screen.getByTestId("reroute-btn"));
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(useRouteStore.getState().activeRoute?.id).toBe("recalculated");
    expect(routeUpdatedCount()).toBe(1);
    await view.unmount();
  });

  it('says "Route updated" once when a fuel stop is added', async () => {
    mockCalculate.mockResolvedValue(routeWithId("via-fuel"));
    const view = await render(<NavigationScreen />);
    await fix();

    await fireEvent.press(screen.getByTestId("fuel-range-add-stop-btn"));
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve));
    });

    expect(useRouteStore.getState().activeRoute?.id).toBe("via-fuel");
    expect(routeUpdatedCount()).toBe(1);
    await view.unmount();
  });
});
