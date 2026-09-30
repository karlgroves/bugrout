/**
 * Maneuvers parsed from a real Valhalla response sit where the maneuver
 * happens (#194).
 *
 * Every maneuver used to be positioned at (0, 0): the first turn of a 2.5 mi
 * Baltimore route read "5505.1 mi" away, and NavigationController — which
 * advances when the user comes within 30 m of the next maneuver — never
 * advanced on a real route. The E2E suite drives the mock route, whose
 * maneuvers do have positions, so it could not see this.
 *
 * The fixture is a response recorded from the live routing server
 * (bugrout-valhalla.fly.dev, 2026-09-30), trimmed to the fields the app reads:
 * Baltimore → a stop at (39.2990, -76.6160) → (39.3138, -76.6021). Two legs,
 * because Valhalla's `begin_shape_index` counts from the start of each leg's
 * own shape, and a stop (a fuel or water waypoint) is what makes a second leg.
 */

import * as NavController from "@/services/navigation/NavigationController";
import {
  calculateRoute,
  initValhalla,
} from "@/services/valhalla/ValhallaModule";
import { haversineDistance } from "@/utils/geo";

import fixture from "./fixtures/valhalla-baltimore-route.json";

import type { LocationUpdate } from "@/services/location/LocationTracker";
import type { NavigationEvent } from "@/services/navigation/NavigationController";
import type { LatLng, Route, RouteManeuver } from "@bugrout/shared";

let mockOnLocation: ((update: LocationUpdate) => void) | null = null;

// GPS is the one input the drive below supplies itself.
jest.mock("@/services/location/LocationTracker", () => ({
  startTracking: jest.fn((onUpdate: (update: LocationUpdate) => void) => {
    mockOnLocation = onUpdate;
    return Promise.resolve();
  }),
  startBatterySavingTracking: jest.fn(() => Promise.resolve()),
  stopTracking: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/services/crowd/CrowdSignal", () => ({
  sendSignal: jest.fn(() => Promise.resolve()),
}));

const ORIGIN = { lat: 39.2904, lng: -76.6122 };
const STOP = { lat: 39.299, lng: -76.616 };
const DESTINATION = { lat: 39.3138, lng: -76.6021 };

/** Metres a maneuver may sit from the point it was requested at: road snapping. */
const SNAP_TOLERANCE_M = 150;

describe("Valhalla maneuver positions", () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.EXPO_PUBLIC_VALHALLA_URL;
  let route: Route;

  beforeAll(async () => {
    process.env.EXPO_PUBLIC_VALHALLA_URL = "https://valhalla.test";
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await initValhalla({ approach: "http", tileDir: "" });
    route = await calculateRoute(ORIGIN, DESTINATION, { waypoints: [STOP] });
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env.EXPO_PUBLIC_VALHALLA_URL = originalUrl;
  });

  const maneuversOf = (leg: number): RouteManeuver[] =>
    route.legs.at(leg)?.maneuvers ?? [];

  it("parses the recorded route, not the mock fallback", () => {
    expect(route.legs).toHaveLength(2);
    expect(maneuversOf(0)).toHaveLength(5);
    expect(maneuversOf(1)).toHaveLength(7);
  });

  it("positions no maneuver at (0, 0)", () => {
    for (const m of route.legs.flatMap((l) => l.maneuvers)) {
      expect(m.position).not.toEqual({ lat: 0, lng: 0 });
    }
  });

  it("starts each leg where it was asked to start", () => {
    const [firstOfLeg1] = maneuversOf(0);
    const [firstOfLeg2] = maneuversOf(1);
    if (!firstOfLeg1 || !firstOfLeg2) throw new Error("missing maneuvers");

    expect(haversineDistance(ORIGIN, firstOfLeg1.position)).toBeLessThan(
      SNAP_TOLERANCE_M,
    );
    // Indexed into the second leg's own shape. Indexing the whole route's
    // shape instead would put this back at the origin, ~1 km from the stop.
    expect(haversineDistance(STOP, firstOfLeg2.position)).toBeLessThan(
      SNAP_TOLERANCE_M,
    );
  });

  it("ends the route at the destination", () => {
    const arrival = maneuversOf(1).at(-1);
    if (!arrival) throw new Error("missing arrival maneuver");

    expect(haversineDistance(DESTINATION, arrival.position)).toBeLessThan(
      SNAP_TOLERANCE_M,
    );
  });

  it("advances through every maneuver to arrival when driven along the route", async () => {
    const events: NavigationEvent[] = [];
    await NavController.start(route, (e) => events.push(e));

    const drive = mockOnLocation;
    if (!drive) throw new Error("navigation did not start GPS tracking");
    const at = (position: LatLng): LocationUpdate => ({
      position,
      heading: 0,
      speed: 10,
      accuracy: 5,
      timestamp: Date.now(),
    });
    for (const point of route.coordinates) {
      drive(at(point));
      // The handler is async; let each update finish before the next.
      await new Promise((resolve) => setImmediate(resolve));
    }
    await NavController.stop();

    const total = route.legs.flatMap((l) => l.maneuvers).length;
    const advances = events.flatMap((e) =>
      e.type === "maneuver_advance" ? [e.index] : [],
    );
    // 1 … total-1, in order: every maneuver after the first is reached.
    expect(advances).toEqual(
      Array.from({ length: total - 1 }, (_, i) => i + 1),
    );
    expect(events.some((e) => e.type === "arrival")).toBe(true);
  });

  it("places every maneuver on the route's own line", () => {
    // Each position is a vertex of the decoded route geometry, so a user
    // driving the drawn line passes through every maneuver point — which is
    // what lets NavigationController's 30 m threshold fire.
    const vertices = new Set(route.coordinates.map((c) => `${c.lat},${c.lng}`));
    for (const m of route.legs.flatMap((l) => l.maneuvers)) {
      expect(vertices.has(`${m.position.lat},${m.position.lng}`)).toBe(true);
    }
  });
});
