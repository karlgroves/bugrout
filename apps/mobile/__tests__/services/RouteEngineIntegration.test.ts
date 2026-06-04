import {
  hasDeviated,
  findClosestRoutePoint,
  estimateRemaining,
} from "@/services/routing/RouteEngine";
import { haversineDistance } from "@/utils/geo";

import type { Route, LatLng } from "@bugrout/shared";

// A simple straight route for testing
const straightRoute: LatLng[] = [
  { lat: 37.0, lng: -122.0 },
  { lat: 37.1, lng: -122.0 },
  { lat: 37.2, lng: -122.0 },
  { lat: 37.3, lng: -122.0 },
  { lat: 37.4, lng: -122.0 },
];

const mockRoute: Route = {
  id: "test-route",
  geometry: "",
  coordinates: straightRoute,
  distance: haversineDistance(straightRoute[0]!, straightRoute[4]!),
  duration: 3600, // 1 hour
  legs: [
    {
      distance: haversineDistance(straightRoute[0]!, straightRoute[4]!),
      duration: 3600,
      maneuvers: [
        {
          type: "depart",
          instruction: "Head north",
          streetName: "Test Road",
          distance: 0,
          duration: 0,
          position: straightRoute[0]!,
          bearingAfter: 0,
        },
        {
          type: "arrive",
          instruction: "You have arrived",
          streetName: "Test Road",
          distance: haversineDistance(straightRoute[0]!, straightRoute[4]!),
          duration: 3600,
          position: straightRoute[4]!,
          bearingAfter: 0,
        },
      ],
    },
  ],
  summary: "Test Road",
};

describe("findClosestRoutePoint", () => {
  it("finds exact point on route", () => {
    const result = findClosestRoutePoint(
      { lat: 37.2, lng: -122.0 },
      straightRoute,
    );
    expect(result.index).toBe(2);
    expect(result.distance).toBeLessThan(1); // < 1 meter
  });

  it("finds nearest point for off-route position", () => {
    const result = findClosestRoutePoint(
      { lat: 37.15, lng: -122.0 },
      straightRoute,
    );
    // Should be closest to index 1 (37.1) or 2 (37.2)
    expect(result.index).toBeGreaterThanOrEqual(1);
    expect(result.index).toBeLessThanOrEqual(2);
  });

  it("handles position far from route", () => {
    const result = findClosestRoutePoint(
      { lat: 40.0, lng: -122.0 },
      straightRoute,
    );
    // Should be closest to the last point
    expect(result.index).toBe(4);
    expect(result.distance).toBeGreaterThan(200000); // > 200km
  });
});

describe("estimateRemaining", () => {
  it("estimates full distance at start of route", () => {
    const remaining = estimateRemaining(straightRoute[0]!, mockRoute);
    // At the start, remaining should be close to total
    expect(remaining.distance).toBeGreaterThan(mockRoute.distance * 0.8);
  });

  it("estimates less distance at middle of route", () => {
    const remaining = estimateRemaining(straightRoute[2]!, mockRoute);
    // At the middle, remaining should be ~60% (index 2 of 5 = middle)
    expect(remaining.distance).toBeLessThan(mockRoute.distance * 0.7);
    expect(remaining.distance).toBeGreaterThan(mockRoute.distance * 0.3);
  });

  it("estimates near-zero at end of route", () => {
    const remaining = estimateRemaining(straightRoute[4]!, mockRoute);
    expect(remaining.distance).toBeLessThan(1000); // < 1km
  });

  it("estimates duration proportionally", () => {
    const atStart = estimateRemaining(straightRoute[0]!, mockRoute);
    const atMiddle = estimateRemaining(straightRoute[2]!, mockRoute);
    expect(atStart.duration).toBeGreaterThan(atMiddle.duration);
  });
});

describe("deviation detection edge cases", () => {
  it("reports no deviation at route start", () => {
    expect(hasDeviated(straightRoute[0]!, straightRoute)).toBe(false);
  });

  it("reports no deviation at route end", () => {
    expect(hasDeviated(straightRoute[4]!, straightRoute)).toBe(false);
  });

  it("reports deviation for position far east of route", () => {
    // ~10km east of route
    expect(
      hasDeviated({ lat: 37.2, lng: -121.9 }, straightRoute),
    ).toBe(true);
  });

  it("reports no deviation for position slightly off route", () => {
    // ~100m east of route (well within 500m threshold)
    expect(
      hasDeviated({ lat: 37.2, lng: -121.999 }, straightRoute),
    ).toBe(false);
  });
});
