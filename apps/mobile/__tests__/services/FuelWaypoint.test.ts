/**
 * A fuel stop can be a gas station from the region package (#200).
 *
 * End to end below SQLite: the data pipeline's real output (the fixture) is
 * loaded by loadPackagedFuelStations, and the route's fuel-stop search picks a
 * station from it. Only the database is stood in for, by an in-memory table
 * that answers the same nearby query.
 */
import { readFileSync } from "fs";
import { join } from "path";

import { loadPackagedFuelStations } from "@/services/resources/FuelService";
import { getResourceWaypoints } from "@/services/routing/WaypointInsertion";

import type { LatLng, ResourcePoint } from "@bugrout/shared";

const mockTable: ResourcePoint[] = [];

jest.mock("@/db/queries/resources", () => ({
  getResourcesByRegion: () => Promise.resolve([]),
  deleteResourcesByType: () => Promise.resolve(),
  upsertResourcePoints: (points: ResourcePoint[]) => {
    mockTable.push(...points);
    return Promise.resolve();
  },
  getResourcesNearPoint: (
    lat: number,
    lng: number,
    radius: number,
    type?: string,
  ) =>
    Promise.resolve(
      mockTable.filter(
        (r) =>
          Math.abs(r.lat - lat) <= radius &&
          Math.abs(r.lng - lng) <= radius &&
          (type === undefined || r.type === type),
      ),
    ),
}));

// eslint-disable-next-line security/detect-non-literal-fs-filename -- this test's own fixture, at a path built from __dirname
const PACKAGE = readFileSync(
  join(__dirname, "../fixtures/fuel-package.json"),
  "utf8",
);

/** A west-to-east road along latitude 39.00, passing ~2 km south of the
 *  fixture's "Building Station" (39.02, -75.99). */
const ROUTE: LatLng[] = Array.from({ length: 16 }, (_, i) => ({
  lat: 39.0,
  lng: -76.05 + i * 0.01,
}));

beforeAll(async () => {
  await loadPackagedFuelStations(PACKAGE, "md", 0);
});

it("routes through a packaged station near the road", async () => {
  const waypoints = await getResourceWaypoints(ROUTE, [
    { type: "fuel", maxDetour: 10_000, enabled: true },
  ]);
  expect(waypoints).toEqual([{ lat: 39.02, lng: -75.99 }]);
});

it("passes up a station further off the road than the detour allows", async () => {
  const waypoints = await getResourceWaypoints(ROUTE, [
    { type: "fuel", maxDetour: 1_000, enabled: true },
  ]);
  expect(waypoints).toEqual([]);
});
