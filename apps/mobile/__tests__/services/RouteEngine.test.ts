import { hasDeviated } from "@/services/routing/RouteEngine";

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

  it("does not latch a route with no geometry as deviated", () => {
    const position = { lat: 37.0, lng: -122.0 };
    // No geometry is "unknown", not "off route" (#298)
    expect(hasDeviated(position, [])).toBe(false);
  });

  // #298: distance was measured to the nearest vertex, so a driver exactly on
  // a long segment read as off route half-way along it.
  describe("on a long straight segment", () => {
    // ~2 km east-west at 39.30 N
    const longSegment = [
      { lat: 39.3, lng: -76.8 },
      { lat: 39.3, lng: -76.8232 },
    ];

    it("is on route at the midpoint (~1 km from either vertex)", () => {
      expect(hasDeviated({ lat: 39.3, lng: -76.8116 }, longSegment)).toBe(
        false,
      );
    });

    it("is on route 300 m off the midpoint", () => {
      // 0.0027 deg latitude is ~300 m
      expect(hasDeviated({ lat: 39.3027, lng: -76.8116 }, longSegment)).toBe(
        false,
      );
    });

    it("is off route 700 m off the midpoint", () => {
      // 0.0063 deg latitude is ~700 m
      expect(hasDeviated({ lat: 39.3063, lng: -76.8116 }, longSegment)).toBe(
        true,
      );
    });
  });
});
