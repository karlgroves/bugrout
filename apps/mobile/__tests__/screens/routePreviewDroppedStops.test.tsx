/**
 * A fuel stop the driver asked for and did not get is said out loud (#341).
 *
 * Both ways of losing one were silent. The corridor search passes over a
 * station inside an active threat zone, so when every station in range is
 * inside one no stop is added at all; and when the routing pass carrying the
 * stops fails, the base route is used instead and the stop that was found goes
 * with it (#295, console.warn only). Either way the driver sets off believing
 * fuel is on the way.
 *
 * These tests assert the driver is TOLD. The filtering itself is covered by
 * FuelStopInThreat.test.ts, and passes against the code that said nothing.
 */

import { render } from "@testing-library/react-native";

import RoutePreviewScreen from "@/app/route-preview/index";
import { droppedStopMessage } from "@/components/routing/DroppedStopNotice";
import { calculateSmartRoute } from "@/services/routing/RouteEngine";
import * as Valhalla from "@/services/valhalla/ValhallaModule";
import { useRouteStore } from "@/stores/useRouteStore";
import { useThreatStore } from "@/stores/useThreatStore";

import type { LatLng, ResourcePoint, Route, ThreatZone } from "@bugrout/shared";

const mockTable: ResourcePoint[] = [];

jest.mock("@/db/queries/resources", () => ({
  getResourcesNearPoint: (
    lat: number,
    lng: number,
    radius: number,
    type?: string,
  ) =>
    Promise.resolve(
      mockTable.filter(
        (r) =>
          Math.abs(r.lat - lat) <= radius &&
          Math.abs(r.lng - lng) <= radius &&
          (type === undefined || r.type === type),
      ),
    ),
}));

jest.mock("@/services/valhalla/ValhallaModule", () => ({
  calculateRoute: jest.fn(),
}));

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

const calculateRoute = Valhalla.calculateRoute as jest.MockedFunction<
  typeof Valhalla.calculateRoute
>;

/** A west-to-east road along latitude 39.00. */
const ROAD: LatLng[] = Array.from({ length: 16 }, (_, i) => ({
  lat: 39.0,
  lng: -76.05 + i * 0.01,
}));

/** ~1.1 km off the road, inside the wildfire below. */
const IN_THREAT = station("in-threat", "Patapsco Fuel", 39.01, -76.0);
/** ~1.1 km off the road, outside every threat. */
const SAFE = station("safe", "Elkridge Fuel", 39.01, -75.92);

const FUEL = [{ type: "fuel" as const, maxDetour: 10_000, enabled: true }];

/** A box around IN_THREAT. */
const WILDFIRE: ThreatZone = {
  id: "t-wildfire",
  type: "wildfire",
  severity: "extreme",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-76.02, 38.99],
        [-75.98, 38.99],
        [-75.98, 39.02],
        [-76.02, 39.02],
        [-76.02, 38.99],
      ],
    ],
  },
  headline: "",
  description: "",
  source: "usfs",
  fetchedAt: 0,
  expiresAt: null,
};

function station(
  id: string,
  name: string,
  lat: number,
  lng: number,
): ResourcePoint {
  return { id, type: "fuel", lat, lng, name, source: "osm" } as ResourcePoint;
}

function route(id: string): Route {
  return {
    id,
    geometry: "",
    coordinates: ROAD,
    distance: 15_000,
    duration: 900,
    legs: [],
    summary: id,
  };
}

beforeEach(() => {
  mockTable.length = 0;
  calculateRoute.mockReset();
  useRouteStore.getState().clearRoute();
  useThreatStore.setState({ threatZones: [], avoidanceEnabled: true });
});

describe("droppedStopMessage", () => {
  it("says nothing when the route carries every stop that was asked for", () => {
    expect(droppedStopMessage([], "mi")).toBeNull();
  });

  it("names the stop, where it is and what to do about it", () => {
    expect(
      droppedStopMessage(
        [
          {
            type: "fuel",
            reason: "in-threat",
            name: "Patapsco Fuel",
            detourMeters: 3200,
          },
        ],
        "mi",
      ),
    ).toBe(
      "No fuel stop on this route: the nearest one, Patapsco Fuel (about 2.0 mi of extra driving), is inside an active threat zone. Fill up before you set off if you can.",
    );
  });

  it("distinguishes nothing in range from nothing routable", () => {
    expect(
      droppedStopMessage(
        [
          {
            type: "water",
            reason: "none-nearby",
            name: null,
            detourMeters: null,
          },
        ],
        "km",
      ),
    ).toContain("the map data has none within the detour you allowed");
    expect(
      droppedStopMessage(
        [
          {
            type: "fuel",
            reason: "routing-failed",
            name: "Elkridge Fuel",
            detourMeters: null,
          },
        ],
        "km",
      ),
    ).toContain("no route could be found through Elkridge Fuel");
  });
});

describe("a fuel stop lost to a threat zone", () => {
  it("tells the driver, naming the station and the reason", async () => {
    mockTable.push(IN_THREAT);
    useThreatStore.setState({ threatZones: [WILDFIRE] });
    calculateRoute.mockResolvedValue(route("base"));

    const calculated = await calculateSmartRoute(ROAD[0]!, ROAD[15]!, FUEL);
    useRouteStore.getState().setRoute(calculated);

    const screen = await render(<RoutePreviewScreen />);
    const notice = screen.getByTestId("dropped-stops");
    expect(notice).toHaveTextContent(/^No fuel stop on this route/);
    expect(notice).toHaveTextContent(/Patapsco Fuel/);
    expect(notice).toHaveTextContent(/inside an active threat zone/);
    expect(notice).toHaveTextContent(/Fill up before you set off/);
    expect(notice.props.accessibilityLiveRegion).toBe("polite");
  });

  it("says nothing when a usable station was found instead", async () => {
    mockTable.push(IN_THREAT, SAFE);
    useThreatStore.setState({ threatZones: [WILDFIRE] });
    calculateRoute.mockResolvedValue(route("with-stop"));

    const calculated = await calculateSmartRoute(ROAD[0]!, ROAD[15]!, FUEL);
    useRouteStore.getState().setRoute(calculated);

    const screen = await render(<RoutePreviewScreen />);
    expect(screen.queryByTestId("dropped-stops")).toBeNull();
  });
});

describe("a fuel stop lost to a failed second pass", () => {
  it("tells the driver the route is the one without it", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(jest.fn());
    mockTable.push(SAFE);
    calculateRoute.mockResolvedValueOnce(route("base"));
    calculateRoute.mockRejectedValueOnce(new Error("442 no path"));

    const calculated = await calculateSmartRoute(ROAD[0]!, ROAD[15]!, FUEL);
    expect(calculated.id).toBe("base");
    useRouteStore.getState().setRoute(calculated);

    const screen = await render(<RoutePreviewScreen />);
    const notice = screen.getByTestId("dropped-stops");
    expect(notice).toHaveTextContent(/Elkridge Fuel/);
    expect(notice).toHaveTextContent(/this is the route without it/);
    warn.mockRestore();
  });
});

describe("the notice does not outlive the route it described", () => {
  it("clears on the next calculation", async () => {
    mockTable.push(IN_THREAT);
    useThreatStore.setState({ threatZones: [WILDFIRE] });
    calculateRoute.mockResolvedValue(route("base"));
    await calculateSmartRoute(ROAD[0]!, ROAD[15]!, FUEL);
    expect(useRouteStore.getState().droppedStops).toHaveLength(1);

    mockTable.push(SAFE);
    await calculateSmartRoute(ROAD[0]!, ROAD[15]!, FUEL);
    expect(useRouteStore.getState().droppedStops).toEqual([]);
  });

  it("clears with the route", () => {
    useRouteStore
      .getState()
      .setDroppedStops([
        { type: "fuel", reason: "none-nearby", name: null, detourMeters: null },
      ]);
    useRouteStore.getState().clearRoute();
    expect(useRouteStore.getState().droppedStops).toEqual([]);
  });
});
