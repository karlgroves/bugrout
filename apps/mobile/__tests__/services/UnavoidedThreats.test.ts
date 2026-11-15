/**
 * A route says which threat areas it was not planned around (#337).
 *
 * Both ways of losing one were console-only: the routing engine's outline
 * limit leaves the furthest areas out of the request (#168), and a zone whose
 * geometry cannot be read is never sent (#287). The count has to be the real
 * one, so it is read off the route calculateRoute() and calculateSmartRoute()
 * return, with the real boundAvoidancePolygons behind it.
 */

import * as AvoidanceBudget from "@/services/routing/AvoidanceBudget";
import { calculateSmartRoute } from "@/services/routing/RouteEngine";
import {
  countUnreadableThreats,
  withUnavoidedThreats,
} from "@/services/routing/ThreatAvoidance";
import {
  calculateRoute,
  initValhalla,
} from "@/services/valhalla/ValhallaModule";
import { useThreatStore } from "@/stores/useThreatStore";

import fixture from "./fixtures/valhalla-baltimore-route.json";

import type { GeoJSONPolygon, Route, ThreatZone } from "@bugrout/shared";

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
const ANNAPOLIS = { lat: 38.9784, lng: -76.4922 };

/** A jagged circle of `radius` meters, as in ValhallaExcludePolygons.test. */
function fire(
  radius: number,
  center: { lat: number; lng: number } = { lat: 39.19, lng: -76.57 },
): GeoJSONPolygon {
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const ring: number[][] = [];
  for (let i = 0; i < 1000; i++) {
    const theta = (2 * Math.PI * i) / 1000;
    const r = radius + 150 * Math.sin(i * 7.3) * Math.cos(i * 3.1 + 0.5);
    ring.push([
      center.lng + (r * Math.cos(theta)) / (111_320 * cosLat),
      center.lat + (r * Math.sin(theta)) / 111_320,
    ]);
  }
  const [first] = ring;
  if (first) ring.push(first);
  return { type: "Polygon", coordinates: [ring] };
}

/** A small square, well outside the Baltimore-Annapolis corridor. */
const FAR_AWAY: GeoJSONPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [-75, 40.5],
      [-74.9, 40.5],
      [-74.9, 40.6],
      [-75, 40.6],
      [-75, 40.5],
    ],
  ],
};

function zone(
  id: string,
  type: ThreatZone["type"],
  geometry: unknown,
): ThreatZone {
  return {
    id,
    type,
    severity: "severe",
    geometry: geometry as ThreatZone["geometry"],
    headline: id,
    description: "",
    source: "usfs",
    fetchedAt: 0,
    expiresAt: null,
  };
}

/** A square whose first vertex is not a number: an unreadable outer ring. */
const UNREADABLE_RING = [
  [
    ["x", 39.1],
    [-76.5, 39.1],
    [-76.5, 39.2],
    [-76.6, 39.2],
    ["x", 39.1],
  ],
];

const originalFetch = global.fetch;
const originalUrl = process.env.EXPO_PUBLIC_VALHALLA_URL;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_VALHALLA_URL = "https://valhalla.test";
  global.fetch = jest.fn(() =>
    Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
  ) as typeof fetch;
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  useThreatStore.setState({ threatZones: [], avoidanceEnabled: true });
  await initValhalla({ tileDir: "/tiles", approach: "http" });
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_VALHALLA_URL;
  else process.env.EXPO_PUBLIC_VALHALLA_URL = originalUrl;
  jest.restoreAllMocks();
});

describe("calculateRoute and the routing engine's avoidance limit", () => {
  it("counts an area that would not fit even simplified", async () => {
    // A 50 km-radius fire over the whole trip: over the limit however smooth.
    const route = await calculateRoute(BALTIMORE, ANNAPOLIS, {
      avoidPolygons: [fire(50_000)],
    });

    expect(route.unavoidedThreats).toBe(1);
  });

  it("counts only the areas left out, not the ones that were sent", async () => {
    const route = await calculateRoute(BALTIMORE, ANNAPOLIS, {
      avoidPolygons: [fire(50_000), fire(1200, { lat: 39.0, lng: -76.5 })],
    });

    expect(route.unavoidedThreats).toBe(1);
  });

  it("carries nothing when every area was sent", async () => {
    const route = await calculateRoute(BALTIMORE, ANNAPOLIS, {
      avoidPolygons: [fire(1200)],
    });

    expect(route).not.toHaveProperty("unavoidedThreats");
  });

  it("does not count an area far from the trip", async () => {
    // Clipped away before the limit applies. It was never going to change
    // the route, so calling it "not avoided" would be a false warning.
    const route = await calculateRoute(BALTIMORE, ANNAPOLIS, {
      avoidPolygons: [FAR_AWAY],
    });

    expect(route).not.toHaveProperty("unavoidedThreats");
  });

  it("says all of them when avoidance could not be applied at all", async () => {
    jest
      .spyOn(AvoidanceBudget, "boundAvoidancePolygons")
      .mockImplementation(() => {
        throw new RangeError("Maximum call stack size exceeded");
      });

    const route = await calculateRoute(BALTIMORE, ANNAPOLIS, {
      avoidPolygons: [fire(1200)],
    });

    expect(route.unavoidedThreats).toBe("all");
  });

  it("carries nothing when nothing was asked for", async () => {
    const route = await calculateRoute(BALTIMORE, ANNAPOLIS);

    expect(route).not.toHaveProperty("unavoidedThreats");
  });
});

describe("countUnreadableThreats", () => {
  it("counts a fire or flood zone with no readable geometry", () => {
    expect(
      countUnreadableThreats([
        zone("null", "wildfire", null),
        zone("bad-ring", "flood", {
          type: "Polygon",
          coordinates: UNREADABLE_RING,
        }),
      ]),
    ).toBe(2);
  });

  it("counts a zone once when only some of its parts are unreadable", () => {
    expect(
      countUnreadableThreats([
        zone("partial", "wildfire", {
          type: "MultiPolygon",
          coordinates: [FAR_AWAY.coordinates, UNREADABLE_RING],
        }),
      ]),
    ).toBe(1);
  });

  it("does not count a readable zone, wherever it is", () => {
    expect(countUnreadableThreats([zone("ok", "wildfire", FAR_AWAY)])).toBe(0);
  });

  it("does not count a weather zone, which is never avoided", () => {
    expect(countUnreadableThreats([zone("storm", "weather", null)])).toBe(0);
  });
});

describe("withUnavoidedThreats", () => {
  const base: Route = {
    id: "r",
    geometry: "",
    coordinates: [],
    distance: 0,
    duration: 0,
    legs: [],
    summary: "",
  };

  it("returns the route itself when there is nothing to add", () => {
    expect(withUnavoidedThreats(base, 0)).toBe(base);
  });

  it("adds to what the route already carries", () => {
    const once = withUnavoidedThreats(base, 2);
    expect(withUnavoidedThreats(once, 1).unavoidedThreats).toBe(3);
  });

  it("keeps all once it is all", () => {
    const all = withUnavoidedThreats(base, "all");
    expect(withUnavoidedThreats(all, 1).unavoidedThreats).toBe("all");
    expect(withUnavoidedThreats(base, 1)).not.toBe(base);
    expect(
      withUnavoidedThreats(withUnavoidedThreats(base, 1), "all")
        .unavoidedThreats,
    ).toBe("all");
  });
});

describe("calculateSmartRoute", () => {
  it("counts a zone it could not send because its geometry is unreadable", async () => {
    useThreatStore.setState({
      threatZones: [zone("unreadable", "wildfire", null)],
    });

    const route = await calculateSmartRoute(BALTIMORE, ANNAPOLIS);

    expect(route.unavoidedThreats).toBe(1);
  });

  it("adds it to the areas the engine's limit left out", async () => {
    useThreatStore.setState({
      threatZones: [
        zone("unreadable", "wildfire", null),
        zone("huge", "wildfire", fire(50_000)),
      ],
    });

    const route = await calculateSmartRoute(BALTIMORE, ANNAPOLIS);

    expect(route.unavoidedThreats).toBe(2);
  });

  it("carries nothing when the store's zones were all sent", async () => {
    useThreatStore.setState({
      threatZones: [zone("small", "wildfire", fire(1200))],
    });

    const route = await calculateSmartRoute(BALTIMORE, ANNAPOLIS);

    expect(route).not.toHaveProperty("unavoidedThreats");
  });

  it("carries nothing when the driver turned avoidance off", async () => {
    useThreatStore.setState({
      threatZones: [
        zone("unreadable", "wildfire", null),
        zone("huge", "wildfire", fire(50_000)),
      ],
      avoidanceEnabled: false,
    });

    const route = await calculateSmartRoute(BALTIMORE, ANNAPOLIS);

    expect(route).not.toHaveProperty("unavoidedThreats");
  });
});
