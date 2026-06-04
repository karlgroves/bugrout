import {
  threatsToAvoidancePolygons,
  routeIntersectsThreat,
} from "@/services/routing/ThreatAvoidance";

import type { ThreatZone } from "@bugrout/shared";

const makeThreat = (
  type: ThreatZone["type"],
  coords: number[][][],
): ThreatZone => ({
  id: `test-${type}`,
  type,
  severity: "severe",
  geometry: { type: "Polygon", coordinates: coords },
  headline: `Test ${type}`,
  description: "",
  source: "nws",
  fetchedAt: Date.now(),
  expiresAt: null,
});

// A square polygon around a small area
const squarePolygon: number[][][] = [
  [
    [-122.5, 37.5],
    [-122.5, 38.0],
    [-122.0, 38.0],
    [-122.0, 37.5],
    [-122.5, 37.5],
  ],
];

describe("threatsToAvoidancePolygons", () => {
  it("converts wildfire threats to polygons", () => {
    const threats = [makeThreat("wildfire", squarePolygon)];
    const polygons = threatsToAvoidancePolygons(threats);
    expect(polygons).toHaveLength(1);
    expect(polygons[0]!.type).toBe("Polygon");
  });

  it("converts flood threats to polygons", () => {
    const threats = [makeThreat("flood", squarePolygon)];
    const polygons = threatsToAvoidancePolygons(threats);
    expect(polygons).toHaveLength(1);
  });

  it("filters out weather threats (only avoid fire and flood)", () => {
    const threats = [makeThreat("weather", squarePolygon)];
    const polygons = threatsToAvoidancePolygons(threats);
    expect(polygons).toHaveLength(0);
  });

  it("handles MultiPolygon by extracting first polygon", () => {
    const threat: ThreatZone = {
      id: "multi",
      type: "wildfire",
      severity: "severe",
      geometry: {
        type: "MultiPolygon",
        coordinates: [squarePolygon, squarePolygon],
      },
      headline: "Multi",
      description: "",
      source: "usfs",
      fetchedAt: Date.now(),
      expiresAt: null,
    };
    const polygons = threatsToAvoidancePolygons([threat]);
    expect(polygons).toHaveLength(1);
    expect(polygons[0]!.type).toBe("Polygon");
  });
});

describe("routeIntersectsThreat", () => {
  const threat = makeThreat("wildfire", squarePolygon);

  it("returns true when route passes through threat zone", () => {
    const route = [
      { lat: 37.7, lng: -122.3 }, // Inside the polygon
    ];
    expect(routeIntersectsThreat(route, threat)).toBe(true);
  });

  it("returns false when route is outside threat zone", () => {
    const route = [
      { lat: 36.0, lng: -120.0 },
      { lat: 36.1, lng: -120.1 },
    ];
    expect(routeIntersectsThreat(route, threat)).toBe(false);
  });

  it("returns false for empty route", () => {
    expect(routeIntersectsThreat([], threat)).toBe(false);
  });
});
