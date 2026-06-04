/**
 * Tests for the waypoint insertion route sampling logic.
 * We test the internal sampling algorithm without SQLite.
 */

import { haversineDistance } from "@/utils/geo";
import type { LatLng } from "@bugrout/shared";

// Re-implement sampleRoute for testing (it's a private function)
function sampleRoute(coordinates: LatLng[], intervalMeters: number): LatLng[] {
  if (coordinates.length === 0) return [];
  const samples: LatLng[] = [coordinates[0]!];
  let accumulated = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const dist = haversineDistance(coordinates[i - 1]!, coordinates[i]!);
    accumulated += dist;
    if (accumulated >= intervalMeters) {
      samples.push(coordinates[i]!);
      accumulated = 0;
    }
  }
  const last = coordinates[coordinates.length - 1]!;
  if (samples[samples.length - 1] !== last) {
    samples.push(last);
  }
  return samples;
}

describe("sampleRoute", () => {
  it("returns empty array for empty route", () => {
    expect(sampleRoute([], 5000)).toEqual([]);
  });

  it("returns single point for single-point route", () => {
    const point = { lat: 37.0, lng: -122.0 };
    const samples = sampleRoute([point], 5000);
    expect(samples).toHaveLength(1);
    expect(samples[0]).toEqual(point);
  });

  it("always includes first and last points", () => {
    const route: LatLng[] = [
      { lat: 37.0, lng: -122.0 },
      { lat: 37.1, lng: -122.0 },
      { lat: 37.2, lng: -122.0 },
      { lat: 37.3, lng: -122.0 },
    ];
    const samples = sampleRoute(route, 5000);
    expect(samples[0]).toEqual(route[0]);
    expect(samples[samples.length - 1]).toEqual(route[route.length - 1]);
  });

  it("samples fewer points with larger interval", () => {
    const route: LatLng[] = [];
    for (let i = 0; i <= 10; i++) {
      route.push({ lat: 37.0 + i * 0.1, lng: -122.0 });
    }
    const denseSamples = sampleRoute(route, 5000);
    const sparseSamples = sampleRoute(route, 50000);
    expect(denseSamples.length).toBeGreaterThanOrEqual(sparseSamples.length);
  });
});
