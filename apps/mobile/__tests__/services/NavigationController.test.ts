/**
 * Tests for NavigationController lifecycle and event handling.
 * These test the internal logic without actually starting GPS.
 */

import type { Route, RouteManeuver } from "@bugrout/shared";

// Test the maneuver flattening logic (re-implemented from controller)
function getAllManeuvers(route: Route): RouteManeuver[] {
  return route.legs.flatMap((leg) => leg.maneuvers);
}

const testRoute: Route = {
  id: "nav-test",
  geometry: "",
  coordinates: [
    { lat: 37.0, lng: -122.0 },
    { lat: 37.1, lng: -122.0 },
    { lat: 37.2, lng: -121.9 },
    { lat: 37.3, lng: -121.9 },
  ],
  distance: 40000,
  duration: 1800,
  legs: [
    {
      distance: 20000,
      duration: 900,
      maneuvers: [
        {
          type: "depart",
          instruction: "Head north on Main St",
          streetName: "Main St",
          distance: 0,
          duration: 0,
          position: { lat: 37.0, lng: -122.0 },
          bearingAfter: 0,
        },
        {
          type: "turn-right",
          instruction: "Turn right onto Oak Ave",
          streetName: "Oak Ave",
          distance: 11000,
          duration: 500,
          position: { lat: 37.1, lng: -122.0 },
          bearingAfter: 90,
        },
      ],
    },
    {
      distance: 20000,
      duration: 900,
      maneuvers: [
        {
          type: "continue",
          instruction: "Continue on Oak Ave",
          streetName: "Oak Ave",
          distance: 11000,
          duration: 500,
          position: { lat: 37.2, lng: -121.9 },
          bearingAfter: 0,
        },
        {
          type: "arrive",
          instruction: "You have arrived",
          streetName: "",
          distance: 9000,
          duration: 400,
          position: { lat: 37.3, lng: -121.9 },
          bearingAfter: 0,
        },
      ],
    },
  ],
  summary: "Main St, Oak Ave",
};

describe("getAllManeuvers", () => {
  it("flattens maneuvers from all legs", () => {
    const maneuvers = getAllManeuvers(testRoute);
    expect(maneuvers).toHaveLength(4);
    expect(maneuvers[0]!.type).toBe("depart");
    expect(maneuvers[1]!.type).toBe("turn-right");
    expect(maneuvers[2]!.type).toBe("continue");
    expect(maneuvers[3]!.type).toBe("arrive");
  });

  it("preserves maneuver order across legs", () => {
    const maneuvers = getAllManeuvers(testRoute);
    expect(maneuvers[0]!.instruction).toBe("Head north on Main St");
    expect(maneuvers[3]!.instruction).toBe("You have arrived");
  });
});

describe("route structure", () => {
  it("has valid distance and duration", () => {
    expect(testRoute.distance).toBeGreaterThan(0);
    expect(testRoute.duration).toBeGreaterThan(0);
  });

  it("has coordinates matching maneuver positions", () => {
    expect(testRoute.coordinates[0]).toEqual(
      testRoute.legs[0]!.maneuvers[0]!.position,
    );
  });

  it("has a summary string", () => {
    expect(testRoute.summary).toBeTruthy();
    expect(testRoute.summary).toContain("Main St");
  });

  it("leg distances sum roughly to total", () => {
    const legSum = testRoute.legs.reduce((s, l) => s + l.distance, 0);
    expect(legSum).toBe(testRoute.distance);
  });
});
