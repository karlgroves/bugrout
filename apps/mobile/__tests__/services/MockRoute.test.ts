/**
 * Tests for mock route generation — used when Valhalla is unavailable.
 * Validates the mock route structure matches what the navigation screen expects.
 */

import { haversineDistance } from "@/utils/geo";
import type { Route, LatLng } from "@bugrout/shared";

// Re-implement buildMockRoute for testing (it's private in ValhallaModule)
function buildMockRoute(origin: LatLng, destination: LatLng): Route {
  const EARTH_RADIUS = 6371000;
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((destination.lng - origin.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((origin.lat * Math.PI) / 180) *
      Math.cos((destination.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const distance =
    EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const duration = distance / 15;

  const numPoints = Math.max(10, Math.round(distance / 1000));
  const coordinates: LatLng[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    coordinates.push({
      lat: origin.lat + t * (destination.lat - origin.lat),
      lng: origin.lng + t * (destination.lng - origin.lng),
    });
  }

  return {
    id: "mock-test",
    geometry: "",
    coordinates,
    distance,
    duration,
    legs: [
      {
        distance,
        duration,
        maneuvers: [
          {
            type: "depart",
            instruction: "Head toward your destination",
            streetName: "Mock Route",
            distance: 0,
            duration: 0,
            position: origin,
            bearingAfter: 0,
          },
          {
            type: "continue",
            instruction: "Continue straight",
            streetName: "Mock Route",
            distance: distance / 2,
            duration: duration / 2,
            position: coordinates[Math.floor(numPoints / 2)]!,
            bearingAfter: 0,
          },
          {
            type: "arrive",
            instruction: "You have arrived at your destination",
            streetName: "",
            distance: distance / 2,
            duration: duration / 2,
            position: destination,
            bearingAfter: 0,
          },
        ],
      },
    ],
    summary: "Mock Route (Valhalla unavailable)",
  };
}

describe("buildMockRoute", () => {
  const sf = { lat: 37.7749, lng: -122.4194 };
  const la = { lat: 34.0522, lng: -118.2437 };

  it("generates a route with correct origin and destination", () => {
    const route = buildMockRoute(sf, la);
    expect(route.coordinates[0]!.lat).toBeCloseTo(sf.lat, 4);
    expect(route.coordinates[0]!.lng).toBeCloseTo(sf.lng, 4);
    const last = route.coordinates[route.coordinates.length - 1];
    expect(last!.lat).toBeCloseTo(la.lat, 4);
    expect(last!.lng).toBeCloseTo(la.lng, 4);
  });

  it("calculates reasonable distance (~559 km SF to LA)", () => {
    const route = buildMockRoute(sf, la);
    expect(route.distance).toBeGreaterThan(500000);
    expect(route.distance).toBeLessThan(600000);
  });

  it("calculates reasonable duration", () => {
    const route = buildMockRoute(sf, la);
    // ~559km at 15 m/s ≈ 37,000 seconds ≈ 10 hours
    expect(route.duration).toBeGreaterThan(30000);
    expect(route.duration).toBeLessThan(45000);
  });

  it("has at least 10 coordinate points", () => {
    const route = buildMockRoute(sf, la);
    expect(route.coordinates.length).toBeGreaterThanOrEqual(10);
  });

  it("has exactly 3 maneuvers (depart, continue, arrive)", () => {
    const route = buildMockRoute(sf, la);
    const maneuvers = route.legs[0]!.maneuvers;
    expect(maneuvers).toHaveLength(3);
    expect(maneuvers[0]!.type).toBe("depart");
    expect(maneuvers[1]!.type).toBe("continue");
    expect(maneuvers[2]!.type).toBe("arrive");
  });

  it("has exactly 1 leg", () => {
    const route = buildMockRoute(sf, la);
    expect(route.legs).toHaveLength(1);
  });

  it("has an id", () => {
    const route = buildMockRoute(sf, la);
    expect(route.id).toBeTruthy();
    expect(typeof route.id).toBe("string");
  });

  it("works for short distances", () => {
    const nearby = { lat: 37.78, lng: -122.42 };
    const route = buildMockRoute(sf, nearby);
    expect(route.distance).toBeGreaterThan(0);
    expect(route.coordinates.length).toBeGreaterThanOrEqual(10);
  });

  it("works for same origin and destination", () => {
    const route = buildMockRoute(sf, sf);
    expect(route.distance).toBeCloseTo(0, 0);
    expect(route.coordinates.length).toBe(11); // min 10 + 1
  });

  it("interpolated points are evenly spaced", () => {
    const route = buildMockRoute(sf, la);
    const coords = route.coordinates;

    // Check that consecutive points have roughly equal spacing
    const distances: number[] = [];
    for (let i = 1; i < coords.length; i++) {
      distances.push(haversineDistance(coords[i - 1]!, coords[i]!));
    }

    const avg = distances.reduce((s, d) => s + d, 0) / distances.length;
    for (const d of distances) {
      // Each segment should be within 10% of the average
      expect(d / avg).toBeGreaterThan(0.9);
      expect(d / avg).toBeLessThan(1.1);
    }
  });
});

describe("route preview data", () => {
  it("formats ETA correctly", () => {
    const route = buildMockRoute(
      { lat: 37.7749, lng: -122.4194 },
      { lat: 34.0522, lng: -118.2437 },
    );
    const eta = new Date(Date.now() + route.duration * 1000);
    const etaStr = eta.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(etaStr).toMatch(/\d{1,2}:\d{2}/);
  });

  it("summary includes mock label", () => {
    const route = buildMockRoute(
      { lat: 37.7749, lng: -122.4194 },
      { lat: 34.0522, lng: -118.2437 },
    );
    expect(route.summary).toContain("Mock");
  });
});
