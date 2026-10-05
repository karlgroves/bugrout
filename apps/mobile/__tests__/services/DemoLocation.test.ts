/**
 * The demo location lets App Review use the Maryland-only app from anywhere
 * (#205): it starts in Baltimore and, once a trip is under way, drives along
 * the route — never along a route that is only being previewed.
 */
import {
  DEMO_ORIGIN,
  pointAlongRoute,
  startDemoDrive,
} from "@/services/location/DemoLocation";
import {
  getCurrentPosition,
  startTracking,
  stopTracking,
  type LocationUpdate,
} from "@/services/location/LocationTracker";
import { useRouteStore } from "@/stores/useRouteStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

import type { LatLng, Route } from "@bugrout/shared";

const mockRequestForeground = jest.fn();
jest.mock("@/platform/location", () => ({
  Accuracy: { High: 4, BestForNavigation: 6 },
  requestForegroundPermissionsAsync: (...args: unknown[]) =>
    mockRequestForeground(...args) as unknown,
  requestBackgroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  watchHeadingAsync: jest.fn(),
}));

/** About 1.1 km due north, then 1.1 km due east. */
const ROUTE: LatLng[] = [
  { lat: 39.29, lng: -76.61 },
  { lat: 39.3, lng: -76.61 },
  { lat: 39.3, lng: -76.597 },
];

describe("pointAlongRoute", () => {
  it("starts at the first point, heading along the first segment", () => {
    const { position, heading, done } = pointAlongRoute(ROUTE, 0);
    expect(position).toEqual(ROUTE[0]);
    expect(heading).toBeCloseTo(0, 0);
    expect(done).toBe(false);
  });

  it("interpolates within a segment", () => {
    const { position } = pointAlongRoute(ROUTE, 556);
    expect(position.lat).toBeCloseTo(39.295, 3);
    expect(position.lng).toBeCloseTo(-76.61, 6);
  });

  it("turns onto the next segment once past the first", () => {
    const { position, heading } = pointAlongRoute(ROUTE, 1200);
    expect(position.lat).toBeCloseTo(39.3, 4);
    expect(position.lng).toBeGreaterThan(-76.61);
    expect(heading).toBeCloseTo(90, 0);
  });

  it("stops at the end, and says so", () => {
    const { position, done } = pointAlongRoute(ROUTE, 1e6);
    expect(position).toEqual(ROUTE[2]);
    expect(done).toBe(true);
  });
});

describe("startDemoDrive", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("stands at the origin with no route", () => {
    const fixes: LocationUpdate[] = [];
    const stop = startDemoDrive(
      (u) => fixes.push(u),
      () => null,
    );
    jest.advanceTimersByTime(3000);
    stop();
    expect(fixes.length).toBeGreaterThan(1);
    for (const fix of fixes) expect(fix.position).toEqual(DEMO_ORIGIN);
  });

  it("drives along the route once a second at a steady speed", () => {
    const fixes: LocationUpdate[] = [];
    const route = [...ROUTE];
    const stop = startDemoDrive(
      (u) => fixes.push(u),
      () => route,
    );
    jest.advanceTimersByTime(10_000);
    stop();
    const lats = fixes.map((f) => f.position.lat);
    expect(lats[0]).toBe(ROUTE[0]?.lat);
    // ~13.4 m/s: about 134 m north after ten seconds.
    expect(lats[10]).toBeCloseTo(39.29 + 134 / 111_200, 4);
    expect(fixes[5]?.speed).toBeGreaterThan(0);
  });

  it("carries on from where it was when tracking restarts", () => {
    const route = [...ROUTE];
    let last: LocationUpdate | undefined;
    const first = startDemoDrive(
      (u) => (last = u),
      () => route,
    );
    jest.advanceTimersByTime(10_000);
    first();
    const before = last?.position.lat ?? 0;

    const second = startDemoDrive(
      (u) => (last = u),
      () => route,
    );
    second();
    expect(last?.position.lat).toBeGreaterThan(before);
  });

  it("starts a new route (a reroute) from that route's start", () => {
    let route: LatLng[] = [...ROUTE];
    let last: LocationUpdate | undefined;
    const stop = startDemoDrive(
      (u) => (last = u),
      () => route,
    );
    jest.advanceTimersByTime(5000);
    route = ROUTE.slice(1);
    jest.advanceTimersByTime(1000);
    stop();
    expect(last?.position).toEqual(ROUTE[1]);
  });
});

describe("LocationTracker with the demo location on", () => {
  const route = { coordinates: ROUTE } as unknown as Route;

  beforeEach(() => {
    jest.useFakeTimers();
    mockRequestForeground.mockReset();
    useSettingsStore.setState({ demoLocation: true });
    useRouteStore.setState({ activeRoute: null, status: "idle" });
  });
  afterEach(async () => {
    await stopTracking();
    useSettingsStore.setState({ demoLocation: false });
    jest.useRealTimers();
  });

  it("reports Baltimore without asking for location permission", async () => {
    const fix = await getCurrentPosition();
    expect(fix.position).toEqual(DEMO_ORIGIN);
    expect(mockRequestForeground).not.toHaveBeenCalled();
  });

  it("stays at the origin while a route is only previewed", async () => {
    useRouteStore.setState({ activeRoute: route, status: "previewing" });
    const fixes: LocationUpdate[] = [];
    await startTracking((u) => fixes.push(u));
    jest.advanceTimersByTime(3000);
    for (const fix of fixes) expect(fix.position).toEqual(DEMO_ORIGIN);
  });

  it("drives the route once the trip is under way", async () => {
    useRouteStore.setState({ activeRoute: route, status: "active" });
    const fixes: LocationUpdate[] = [];
    await startTracking((u) => fixes.push(u));
    jest.advanceTimersByTime(5000);
    // On the route (its first leg runs due north along -76.61), not the origin.
    expect(fixes.at(-1)?.position.lng).toBeCloseTo(-76.61, 6);
    expect(fixes.at(-1)?.position.lat).toBeGreaterThan(39.29);
    expect(mockRequestForeground).not.toHaveBeenCalled();
  });

  it("stops emitting when tracking stops", async () => {
    const fixes: LocationUpdate[] = [];
    await startTracking((u) => fixes.push(u));
    await stopTracking();
    const count = fixes.length;
    jest.advanceTimersByTime(5000);
    expect(fixes).toHaveLength(count);
  });

  it("is off by default", () => {
    expect(useSettingsStore.getInitialState().demoLocation).toBe(false);
  });
});
