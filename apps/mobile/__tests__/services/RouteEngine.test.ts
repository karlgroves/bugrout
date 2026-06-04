import { hasDeviated, DEVIATION_THRESHOLD_METERS } from "@/services/routing/RouteEngine";

describe("hasDeviated", () => {
  const routeCoordinates = [
    { lat: 37.7749, lng: -122.4194 },
    { lat: 37.7849, lng: -122.4094 },
    { lat: 37.7949, lng: -122.3994 },
  ];

  it("returns false when user is on the route", () => {
    const position = { lat: 37.7849, lng: -122.4094 }; // Exactly on route
    expect(hasDeviated(position, routeCoordinates)).toBe(false);
  });

  it("returns false when user is near the route", () => {
    // Slightly offset (~100m)
    const position = { lat: 37.7859, lng: -122.4094 };
    expect(hasDeviated(position, routeCoordinates)).toBe(false);
  });

  it("returns true when user is far from the route (>500m)", () => {
    // Very far away
    const position = { lat: 38.0, lng: -122.0 };
    expect(hasDeviated(position, routeCoordinates)).toBe(true);
  });

  it("handles single-point route", () => {
    const position = { lat: 37.7749, lng: -122.4194 };
    expect(hasDeviated(position, [position])).toBe(false);
  });

  it("handles empty route", () => {
    const position = { lat: 37.0, lng: -122.0 };
    // With empty route, minDist is Infinity, so deviation is true
    expect(hasDeviated(position, [])).toBe(true);
  });
});
