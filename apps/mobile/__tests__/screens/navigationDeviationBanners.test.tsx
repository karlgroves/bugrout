/**
 * The low-battery and fuel-range banners stay up while the driver is off
 * route (#298).
 *
 * The navigation screen used to render both only when `!hasDeviated`, so one
 * deviation (true or false) hid them; a low battery matters more off route,
 * not less.
 */

import { render } from "@testing-library/react-native";

import NavigationScreen from "@/app/navigation/[routeId]";
import { useRouteStore } from "@/stores/useRouteStore";

import type { Route } from "@bugrout/shared";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ routeId: "deviation-banners" }),
}));

jest.mock("@/services/navigation/NavigationController", () => ({
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  release: () => Promise.resolve(),
  isActive: () => false,
  updateRoute: jest.fn(),
}));

jest.mock("@/components/navigation/RouteBody", () => ({
  RouteBody: () => null,
}));
jest.mock("@/hooks/useBattery", () => ({
  useBattery: () => ({
    level: 0.12,
    percent: 12,
    isCharging: false,
    isLow: true,
    isCritical: false,
  }),
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

const ROUTE: Route = {
  id: "deviation-banners",
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
  useRouteStore.getState().clearRoute();
  useRouteStore.getState().setRoute(ROUTE);
  useRouteStore.getState().startNavigation();
});

describe("navigation screen safety banners (#298)", () => {
  it("shows the battery and fuel banners alongside the deviation banner", async () => {
    useRouteStore.getState().setDeviated(true);

    const screen = await render(<NavigationScreen />);

    expect(screen.getByLabelText("Dismiss deviation warning")).toBeTruthy();
    expect(screen.getByLabelText("Battery 12% — low")).toBeTruthy();
    expect(screen.getByTestId("fuel-range-warning")).toBeTruthy();
  });

  it("shows them on route too", async () => {
    const screen = await render(<NavigationScreen />);

    expect(screen.queryByLabelText("Dismiss deviation warning")).toBe(null);
    expect(screen.getByLabelText("Battery 12% — low")).toBeTruthy();
    expect(screen.getByTestId("fuel-range-warning")).toBeTruthy();
  });
});
