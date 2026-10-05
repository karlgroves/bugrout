/**
 * The route preview switches between the map and the directions list (#192)
 * without losing Go, Back, the summary or the disclaimer, and the choice lasts
 * for the trip but not beyond it.
 */

import { fireEvent, render } from "@testing-library/react-native";

import RoutePreviewScreen from "@/app/route-preview/index";
import { DISCLAIMER_SHORT } from "@/constants/legal";
import { useRouteStore } from "@/stores/useRouteStore";

import type { Route } from "@bugrout/shared";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("@/components/map/BugroutMap", () => {
  const { View } = jest.requireActual<{
    View: React.ComponentType<{ testID?: string }>;
  }>("react-native");
  return { BugroutMap: () => <View testID="mock-map" /> };
});
jest.mock("@/components/map/ThreatOverlay", () => ({
  ThreatOverlay: () => null,
}));

const ROUTE: Route = {
  id: "route-1",
  summary: "North Calvert Street",
  geometry: "",
  coordinates: [{ lat: 39.2904, lng: -76.6122 }],
  distance: 4000,
  duration: 360,
  legs: [
    {
      distance: 4000,
      duration: 360,
      maneuvers: [
        {
          type: "depart",
          instruction: "Drive north on North Calvert Street.",
          streetName: "North Calvert Street",
          distance: 4000,
          duration: 360,
          position: { lat: 39.2904, lng: -76.6122 },
          bearingAfter: 0,
        },
        {
          type: "arrive",
          instruction: "You have arrived at your destination.",
          streetName: "",
          distance: 0,
          duration: 0,
          position: { lat: 39.3138, lng: -76.6021 },
          bearingAfter: 0,
        },
      ],
    },
  ],
};

beforeEach(() => {
  useRouteStore.getState().clearRoute();
  useRouteStore.getState().setRoute(ROUTE);
});

describe("route preview — map or directions", () => {
  it("opens on the map", async () => {
    const screen = await render(<RoutePreviewScreen />);

    expect(screen.getByTestId("mock-map")).toBeTruthy();
    expect(screen.queryByTestId("directions-list")).toBeNull();
  });

  it("shows every turn on Directions, keeping Go, Back and the disclaimer", async () => {
    const screen = await render(<RoutePreviewScreen />);

    await fireEvent.press(screen.getByLabelText("Directions"));

    expect(screen.getByTestId("directions-list")).toBeTruthy();
    expect(screen.queryByTestId("mock-map")).toBeNull();
    expect(
      screen.getByText("You have arrived at your destination."),
    ).toBeTruthy();
    expect(screen.getByTestId("route-preview-go-btn")).toBeTruthy();
    expect(screen.getByText("Back")).toBeTruthy();
    expect(screen.getByText(DISCLAIMER_SHORT)).toBeTruthy();
  });

  it("keeps the choice for the trip, and forgets it when the route is cleared", async () => {
    const screen = await render(<RoutePreviewScreen />);
    await fireEvent.press(screen.getByLabelText("Directions"));
    expect(useRouteStore.getState().routeView).toBe("directions");

    useRouteStore.getState().startNavigation();
    expect(useRouteStore.getState().routeView).toBe("directions");

    useRouteStore.getState().clearRoute();
    expect(useRouteStore.getState().routeView).toBe("map");
  });
});
