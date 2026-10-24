/**
 * Fuel range warning thresholds (#203, spec §7.3).
 *
 * The banner rests on three decisions: how much range is left, which station
 * is the next one ahead, and whether reaching it would leave too little in the
 * tank. Each is tested here on its own, because the screen can only show what
 * these return.
 */
import {
  findNextFuelStop,
  remainingRangeMeters,
  shouldWarnOnFuelRange,
} from "@/services/navigation/FuelRange";

import type { LatLng, ResourcePoint } from "@bugrout/shared";

/** A due-east run along the 39.0 parallel; ~86.6 km per degree of longitude. */
const ROUTE: LatLng[] = [
  { lat: 39.0, lng: -77.0 },
  { lat: 39.0, lng: -76.5 },
  { lat: 39.0, lng: -76.0 },
];

/**
 * Build a fuel station for the table.
 */
function station(id: string, lat: number, lng: number): ResourcePoint {
  return {
    id,
    type: "fuel",
    name: `Station ${id}`,
    lat,
    lng,
    address: null,
    metadata: {},
    source: "osm",
    fetchedAt: 0,
    regionId: "md",
  };
}

describe("remainingRangeMeters", () => {
  it("subtracts what has been driven from the range given", () => {
    expect(remainingRangeMeters(100000, 30000)).toBe(70000);
  });

  it("never goes below empty", () => {
    expect(remainingRangeMeters(40000, 90000)).toBe(0);
  });
});

describe("findNextFuelStop", () => {
  const position: LatLng = { lat: 39.0, lng: -76.9 };

  it("finds nothing when the region packages no stations", () => {
    expect(findNextFuelStop(ROUTE, position, [])).toBe(null);
  });

  it("ignores a station behind the driver", () => {
    const behind = station("behind", 39.0, -76.95);
    expect(findNextFuelStop(ROUTE, position, [behind])).toBe(null);
  });

  it("ignores a station too far off the route", () => {
    // ~22 km north of the line, well outside the 8 km corridor.
    const offRoute = station("off", 39.2, -76.8);
    expect(findNextFuelStop(ROUTE, position, [offRoute])).toBe(null);
  });

  it("takes the first station ahead, not merely the closest to the line", () => {
    const nearer = station("nearer", 39.0, -76.8);
    const further = station("further", 39.0, -76.2);
    const found = findNextFuelStop(ROUTE, position, [further, nearer]);
    expect(found?.resource.id).toBe("nearer");
  });

  it("counts the detour off the route in the distance to the station", () => {
    const onLine = station("on-line", 39.0, -76.8);
    const offLine = station("off-line", 39.03, -76.8);

    const direct = findNextFuelStop(ROUTE, position, [onLine]);
    const detour = findNextFuelStop(ROUTE, position, [offLine]);

    expect(direct).not.toBe(null);
    expect(detour).not.toBe(null);
    // The second sits ~3.3 km north of the same turn-off, so it costs more.
    expect(detour?.distanceAhead).toBeGreaterThan(
      (direct?.distanceAhead ?? 0) + 2000,
    );
  });

  it("measures the distance ahead along the route", () => {
    const ahead = station("ahead", 39.0, -76.8);
    const found = findNextFuelStop(ROUTE, position, [ahead]);
    // 0.1° of longitude at 39°N is ~8.6 km.
    expect(found?.distanceAhead).toBeGreaterThan(8000);
    expect(found?.distanceAhead).toBeLessThan(9500);
  });
});

describe("shouldWarnOnFuelRange", () => {
  const stop = {
    resource: station("s", 39.0, -76.8),
    distanceAhead: 50000,
  };

  it("stays silent when the driver gave no range", () => {
    expect(shouldWarnOnFuelRange(null, stop)).toBe(false);
  });

  it("stays silent when no station is ahead", () => {
    expect(shouldWarnOnFuelRange(20000, null)).toBe(false);
  });

  it("defaults to a 10-mile margin either side of the threshold", () => {
    // 16 km past the station is comfortable; 16 km short of that is not.
    expect(shouldWarnOnFuelRange(50000 + 16000 + 1000, stop)).toBe(false);
    expect(shouldWarnOnFuelRange(50000 + 16000 - 1000, stop)).toBe(true);
  });

  it("warns when the station is already out of reach", () => {
    expect(shouldWarnOnFuelRange(10000, stop)).toBe(true);
  });

  it("honours a caller-supplied margin", () => {
    expect(shouldWarnOnFuelRange(55000, stop, 1000)).toBe(false);
    expect(shouldWarnOnFuelRange(55000, stop, 10000)).toBe(true);
  });
});
