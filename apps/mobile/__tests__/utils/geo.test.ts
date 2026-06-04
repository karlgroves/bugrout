import {
  haversineDistance,
  pointInBBox,
  expandBBox,
  formatDistance,
  formatDuration,
} from "@/utils/geo";

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
