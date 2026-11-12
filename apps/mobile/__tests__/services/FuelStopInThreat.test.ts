/**
 * A fuel stop inside an active threat must not cost the user their route
 * (#295).
 *
 * Two defects: the stop search ranked stations on detour alone, so a station
 * inside a fire perimeter could be picked and sent to Valhalla as a mandatory
 * waypoint in the same request that excludes the fire (Valhalla answers
 * 400/442); and that failure threw away the base route that had already been
 * computed.
 */
import { calculateSmartRoute } from "@/services/routing/RouteEngine";
import { getResourceWaypoints } from "@/services/routing/WaypointInsertion";
import * as Valhalla from "@/services/valhalla/ValhallaModule";

import type {
  LatLng,
  ResourcePoint,
  Route,
  ThreatType,
  ThreatZone,
} from "@bugrout/shared";

const mockTable: ResourcePoint[] = [];
const mockThreatState: {
  threatZones: ThreatZone[];
  avoidanceEnabled: boolean;
} = { threatZones: [], avoidanceEnabled: true };

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

jest.mock("@/stores/useThreatStore", () => ({
  useThreatStore: { getState: () => mockThreatState },
}));

jest.mock("@/services/valhalla/ValhallaModule", () => ({
  calculateRoute: jest.fn(),
}));

const calculateRoute = Valhalla.calculateRoute as jest.MockedFunction<
  typeof Valhalla.calculateRoute
>;

/** A west-to-east road along latitude 39.00. */
const ROUTE: LatLng[] = Array.from({ length: 16 }, (_, i) => ({
  lat: 39.0,
  lng: -76.05 + i * 0.01,
}));

/** ~1.1 km off the road, inside the threat below. */
const NEAR_IN_THREAT = station("near-in-threat", 39.01, -76.0);
/** ~3.3 km off the road, outside every threat. */
const FAR_SAFE = station("far-safe", 39.03, -75.95);

/** A box around NEAR_IN_THREAT that also covers that stretch of road. */
function threat(type: ThreatType): ThreatZone {
  return {
    id: `t-${type}`,
    type,
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
}

function station(id: string, lat: number, lng: number): ResourcePoint {
  return {
    id,
    type: "fuel",
    lat,
    lng,
    name: id,
    source: "osm",
  } as ResourcePoint;
}

function route(id: string): Route {
  return {
    id,
    geometry: "",
    coordinates: ROUTE,
    distance: 15_000,
    duration: 900,
    legs: [],
    summary: id,
  };
}

const FUEL = [{ type: "fuel" as const, maxDetour: 10_000, enabled: true }];

beforeEach(() => {
  mockTable.length = 0;
  mockTable.push(NEAR_IN_THREAT, FAR_SAFE);
  mockThreatState.threatZones = [];
  calculateRoute.mockReset();
});

describe("resource stop selection", () => {
  it("picks the nearest station when no threat covers it", async () => {
    await expect(getResourceWaypoints(ROUTE, FUEL)).resolves.toEqual([
      { lat: 39.01, lng: -76.0 },
    ]);
  });

  it.each<ThreatType>(["wildfire", "flood", "weather"])(
    "passes up a station inside an active %s threat",
    async (type) => {
      await expect(
        getResourceWaypoints(ROUTE, FUEL, [threat(type)]),
      ).resolves.toEqual([{ lat: 39.03, lng: -75.95 }]);
    },
  );

  it("checks every part of a multi-part threat", async () => {
    const box = threat("wildfire");
    const parts = box.geometry.coordinates as number[][][];
    const multi: ThreatZone = {
      ...box,
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-70, 40],
              [-69.9, 40],
              [-69.9, 40.1],
              [-70, 40],
            ],
          ],
          parts,
        ],
      },
    };
    await expect(getResourceWaypoints(ROUTE, FUEL, [multi])).resolves.toEqual([
      { lat: 39.03, lng: -75.95 },
    ]);
  });
});

describe("calculateSmartRoute", () => {
  it("keeps the fuel stop out of the threat in the waypoint request", async () => {
    mockThreatState.threatZones = [threat("wildfire")];
    calculateRoute.mockResolvedValueOnce(route("base"));
    calculateRoute.mockResolvedValueOnce(route("with-stop"));

    await calculateSmartRoute(ROUTE[0]!, ROUTE[15]!, FUEL);

    expect(calculateRoute.mock.calls[1]?.[2]?.waypoints).toEqual([
      { lat: 39.03, lng: -75.95 },
    ]);
  });

  it("returns the base route when the route with resource stops fails", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(jest.fn());
    calculateRoute.mockResolvedValueOnce(route("base"));
    calculateRoute.mockRejectedValueOnce(new Error("442 no path"));

    await expect(
      calculateSmartRoute(ROUTE[0]!, ROUTE[15]!, FUEL),
    ).resolves.toMatchObject({ id: "base" });
    expect(calculateRoute).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("still fails when only the caller's own waypoints are in the request", async () => {
    calculateRoute.mockResolvedValueOnce(route("base"));
    calculateRoute.mockRejectedValueOnce(new Error("442 no path"));

    await expect(
      calculateSmartRoute(ROUTE[0]!, ROUTE[15]!, undefined, {
        waypoints: [{ lat: 39.0, lng: -76.0 }],
      }),
    ).rejects.toThrow("442 no path");
  });
});
