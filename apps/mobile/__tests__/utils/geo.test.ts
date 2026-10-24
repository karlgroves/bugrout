import {
  haversineDistance,
  pointInBBox,
  expandBBox,
  extractRingCoordinates,
  pointInPolygon,
  formatDistance,
  formatDuration,
  placeKey,
  projectOntoPolyline,
} from "@/utils/geo";

import type { LatLng, ThreatZone } from "@bugrout/shared";

describe("haversineDistance", () => {
  it("returns 0 for same point", () => {
    const point = { lat: 37.7749, lng: -122.4194 };
    expect(haversineDistance(point, point)).toBe(0);
  });

  it("calculates distance between SF and LA (~559 km)", () => {
    const sf = { lat: 37.7749, lng: -122.4194 };
    const la = { lat: 34.0522, lng: -118.2437 };
    const dist = haversineDistance(sf, la);
    // Should be roughly 559 km
    expect(dist).toBeGreaterThan(550000);
    expect(dist).toBeLessThan(570000);
  });

  it("calculates short distance accurately", () => {
    // ~1 degree of latitude ≈ 111km
    const a = { lat: 37.0, lng: -122.0 };
    const b = { lat: 38.0, lng: -122.0 };
    const dist = haversineDistance(a, b);
    expect(dist).toBeGreaterThan(110000);
    expect(dist).toBeLessThan(112000);
  });
});

describe("pointInBBox", () => {
  const bbox = { west: -123, south: 37, east: -122, north: 38 };

  it("returns true for point inside bbox", () => {
    expect(pointInBBox({ lat: 37.5, lng: -122.5 }, bbox)).toBe(true);
  });

  it("returns false for point outside bbox", () => {
    expect(pointInBBox({ lat: 36.0, lng: -122.5 }, bbox)).toBe(false);
  });

  it("returns true for point on bbox boundary", () => {
    expect(pointInBBox({ lat: 37, lng: -122 }, bbox)).toBe(true);
  });
});

describe("expandBBox", () => {
  it("expands bbox by given meters", () => {
    const bbox = { west: -122, south: 37, east: -121, north: 38 };
    const expanded = expandBBox(bbox, 10000); // 10 km
    expect(expanded.south).toBeLessThan(bbox.south);
    expect(expanded.north).toBeGreaterThan(bbox.north);
    expect(expanded.west).toBeLessThan(bbox.west);
    expect(expanded.east).toBeGreaterThan(bbox.east);
  });
});

describe("extractRingCoordinates", () => {
  it("returns the outer ring of a Polygon", () => {
    const geometry: ThreatZone["geometry"] = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    };
    expect(extractRingCoordinates(geometry)).toEqual([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ]);
  });

  it("ignores interior holes, keeping only the outer ring", () => {
    const geometry: ThreatZone["geometry"] = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 1],
        ],
      ],
    };
    expect(extractRingCoordinates(geometry)).toEqual([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 0],
    ]);
  });

  it("concatenates each polygon's outer ring for a MultiPolygon", () => {
    const geometry: ThreatZone["geometry"] = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
        [
          [
            [5, 5],
            [6, 5],
            [6, 6],
            [5, 5],
          ],
        ],
      ],
    };
    expect(extractRingCoordinates(geometry)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
      [5, 5],
      [6, 5],
      [6, 6],
      [5, 5],
    ]);
  });

  it("returns an empty array for a Polygon with no rings", () => {
    const geometry: ThreatZone["geometry"] = {
      type: "Polygon",
      coordinates: [],
    };
    expect(extractRingCoordinates(geometry)).toEqual([]);
  });
});

describe("pointInPolygon", () => {
  // Counter-clockwise unit square from (0,0) to (4,4)
  const square: number[][] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];

  it("returns true for a point inside", () => {
    expect(pointInPolygon([2, 2], square)).toBe(true);
  });

  it("returns false for a point outside", () => {
    expect(pointInPolygon([5, 2], square)).toBe(false);
  });

  it("returns false for a point beyond every vertex", () => {
    expect(pointInPolygon([-1, -1], square)).toBe(false);
  });

  it("handles a concave ring — the notch is outside", () => {
    // C-shape: the gap between the arms must not count as inside.
    const cShape: number[][] = [
      [0, 0],
      [4, 0],
      [4, 1],
      [1, 1],
      [1, 3],
      [4, 3],
      [4, 4],
      [0, 4],
    ];
    expect(pointInPolygon([2, 2], cShape)).toBe(false);
    expect(pointInPolygon([0.5, 2], cShape)).toBe(true);
  });

  it("returns false for a degenerate ring with too few points", () => {
    expect(
      pointInPolygon(
        [1, 1],
        [
          [0, 0],
          [2, 2],
        ],
      ),
    ).toBe(false);
  });

  it("returns false for an empty ring", () => {
    expect(pointInPolygon([1, 1], [])).toBe(false);
  });

  it("skips malformed coordinate pairs instead of throwing", () => {
    const ragged: number[][] = [[0, 0], [4, 0], [4], [0, 4]];
    expect(() => pointInPolygon([2, 2], ragged)).not.toThrow();
  });
});

describe("formatDistance", () => {
  it("formats short miles distance in feet", () => {
    expect(formatDistance(50, "mi")).toMatch(/\d+ ft/);
  });

  it("formats long miles distance", () => {
    expect(formatDistance(5000, "mi")).toMatch(/\d+\.\d mi/);
  });

  it("formats short km distance in meters", () => {
    expect(formatDistance(500, "km")).toMatch(/\d+ m/);
  });

  it("formats long km distance", () => {
    expect(formatDistance(5000, "km")).toMatch(/\d+\.\d km/);
  });
});

describe("formatDuration", () => {
  it("formats minutes only", () => {
    expect(formatDuration(300)).toBe("5 min");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(3900)).toBe("1h 5m");
  });

  it("formats zero minutes", () => {
    expect(formatDuration(30)).toBe("0 min");
  });
});

describe("placeKey", () => {
  it("rounds to 4 decimal places (~11 m)", () => {
    expect(placeKey({ lat: 39.31384, lng: -76.60208 })).toBe(
      "39.3138,-76.6021",
    );
  });

  it("gives nearby points within the rounding the same key", () => {
    expect(placeKey({ lat: 39.31381, lng: -76.60211 })).toBe(
      placeKey({ lat: 39.31384, lng: -76.60208 }),
    );
  });

  it("keeps points ~22 m apart distinct", () => {
    expect(placeKey({ lat: 39.3138, lng: -76.6021 })).not.toBe(
      placeKey({ lat: 39.314, lng: -76.6021 }),
    );
  });
});

describe("projectOntoPolyline", () => {
  /** A due-east run along the 39.0 parallel. */
  const line: LatLng[] = [
    { lat: 39.0, lng: -77.0 },
    { lat: 39.0, lng: -76.5 },
    { lat: 39.0, lng: -76.0 },
  ];

  it("returns null for an empty polyline", () => {
    expect(projectOntoPolyline({ lat: 39, lng: -77 }, [])).toBe(null);
  });

  it("measures distance to a single-point polyline", () => {
    const projection = projectOntoPolyline({ lat: 39.0, lng: -76.9 }, [
      { lat: 39.0, lng: -77.0 },
    ]);
    expect(projection?.alongMeters).toBe(0);
    expect(projection?.offMeters).toBeGreaterThan(8000);
  });

  it("puts a point on the line at zero off-distance", () => {
    const projection = projectOntoPolyline({ lat: 39.0, lng: -76.75 }, line);
    expect(projection?.offMeters).toBeLessThan(1);
  });

  it("measures how far along the line the nearest point sits", () => {
    const projection = projectOntoPolyline({ lat: 39.0, lng: -76.75 }, line);
    // A quarter of a 0.5°+0.5° run at 39°N: ~21.6 km.
    expect(projection?.alongMeters).toBeGreaterThan(21000);
    expect(projection?.alongMeters).toBeLessThan(22200);
  });

  it("measures perpendicular distance off the line", () => {
    const projection = projectOntoPolyline({ lat: 39.1, lng: -76.75 }, line);
    // 0.1° of latitude is ~11.1 km, whatever the longitude.
    expect(projection?.offMeters).toBeGreaterThan(10500);
    expect(projection?.offMeters).toBeLessThan(11600);
    expect(projection?.alongMeters).toBeGreaterThan(21000);
  });

  it("clamps a point beyond the end to the last vertex", () => {
    const projection = projectOntoPolyline({ lat: 39.0, lng: -75.5 }, line);
    const [start, , end] = line;
    const total = haversineDistance(start!, end!);
    expect(projection?.alongMeters).toBeCloseTo(total, -2);
  });

  it("clamps a point before the start to the first vertex", () => {
    const projection = projectOntoPolyline({ lat: 39.0, lng: -77.5 }, line);
    expect(projection?.alongMeters).toBe(0);
  });
});
