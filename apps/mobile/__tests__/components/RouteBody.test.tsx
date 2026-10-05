/**
 * The navigation screen shows the map or the directions list (#192), and the
 * map whenever there is no route to list.
 */

import { render } from "@testing-library/react-native";

import { RouteBody } from "@/components/navigation/RouteBody";

import type { Route } from "@bugrout/shared";
import type * as ReactNative from "react-native";

jest.mock("@/components/map/BugroutMap", () => ({
  BugroutMap: () => {
    const { Text: MockText } =
      jest.requireActual<typeof ReactNative>("react-native");
    return <MockText>the map</MockText>;
  },
}));
jest.mock("@/components/map/ThreatOverlay", () => ({
  ThreatOverlay: () => null,
}));

const route: Route = {
  id: "r1",
  summary: "",
  geometry: "",
  coordinates: [],
  distance: 1609,
  duration: 120,
  legs: [
    {
      distance: 1609,
      duration: 120,
      maneuvers: [
        {
          type: "continue",
          instruction: "Head north on Main Street",
          streetName: "",
          distance: 1609,
          duration: 120,
          position: { lat: 0, lng: 0 },
          bearingAfter: 0,
        },
      ],
    },
  ],
};

const common = {
  maneuverIndex: 0,
  metresToManeuver: 100,
  position: null,
  heading: 0,
};

describe("RouteBody", () => {
  it("shows the map in the map view", async () => {
    const screen = await render(
      <RouteBody view="map" route={route} {...common} />,
    );
    expect(screen.getByText("the map")).toBeTruthy();
    expect(screen.queryByText(/Head north on Main Street/)).toBeNull();
  });

  it("shows every step in the directions view, not the map", async () => {
    const screen = await render(
      <RouteBody view="directions" route={route} {...common} />,
    );
    expect(
      screen.getAllByText(/Head north on Main Street/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("the map")).toBeNull();
  });

  it("falls back to the map when there is no route to list", async () => {
    const screen = await render(
      <RouteBody view="directions" route={null} {...common} />,
    );
    expect(screen.getByText("the map")).toBeTruthy();
  });
});
