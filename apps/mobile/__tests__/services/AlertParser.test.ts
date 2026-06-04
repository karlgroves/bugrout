import {
  threatOverlapsBBox,
  filterThreatsInBBox,
} from "@/services/alerts/AlertParser";
import type { ThreatZone, BBox } from "@bugrout/shared";

const makeThreat = (coords: number[][][]): ThreatZone => ({
  id: "test",
  type: "wildfire",
  severity: "severe",
  geometry: { type: "Polygon", coordinates: coords },
  headline: "Test",
  description: "",
  source: "usfs",
  fetchedAt: Date.now(),
  expiresAt: null,
});

const sfBbox: BBox = {
  west: -122.52,
  south: 37.7,
  east: -122.35,
  north: 37.82,
};

describe("threatOverlapsBBox", () => {
  it("returns true when threat vertex is inside bbox", () => {
    const threat = makeThreat([
      [
        [-122.45, 37.75],
        [-122.4, 37.75],
        [-122.4, 37.78],
        [-122.45, 37.78],
        [-122.45, 37.75],
      ],
    ]);
    expect(threatOverlapsBBox(threat, sfBbox)).toBe(true);
  });

  it("returns false when threat is completely outside bbox", () => {
    const threat = makeThreat([
      [
        [-121.0, 36.0],
        [-120.9, 36.0],
        [-120.9, 36.1],
        [-121.0, 36.1],
        [-121.0, 36.0],
      ],
    ]);
    expect(threatOverlapsBBox(threat, sfBbox)).toBe(false);
  });

  it("returns true when threat completely contains the bbox", () => {
    const threat = makeThreat([
      [
        [-123.0, 37.0],
        [-122.0, 37.0],
        [-122.0, 38.0],
        [-123.0, 38.0],
        [-123.0, 37.0],
      ],
    ]);
    expect(threatOverlapsBBox(threat, sfBbox)).toBe(true);
  });
});

describe("filterThreatsInBBox", () => {
  it("filters threats to those in the bbox", () => {
    const inside = makeThreat([
      [
        [-122.45, 37.75],
        [-122.4, 37.75],
        [-122.4, 37.78],
        [-122.45, 37.78],
        [-122.45, 37.75],
      ],
    ]);
    const outside = makeThreat([
      [
        [-121.0, 36.0],
        [-120.9, 36.0],
        [-120.9, 36.1],
        [-121.0, 36.1],
        [-121.0, 36.0],
      ],
    ]);
    Object.assign(outside, { id: "outside" });

    const result = filterThreatsInBBox([inside, outside], sfBbox);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("test");
  });
});
