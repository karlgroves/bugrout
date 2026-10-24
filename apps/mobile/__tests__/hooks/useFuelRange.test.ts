/**
 * Range tracking across a trip's position updates (#203).
 *
 * The threshold maths is covered in __tests__/services/FuelRange.test.ts. What
 * this pins is the part only the hook can get wrong: that the station list
 * survives a stream of GPS ticks, and that the range left reflects the
 * distance actually driven — including across a reroute, which replaces the
 * route and resets progress along it.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useFuelRange } from "@/hooks/useFuelRange";
import { useRouteStore } from "@/stores/useRouteStore";

import type { LatLng, ResourcePoint, Route } from "@bugrout/shared";

const mockNearPoint = jest.fn();
jest.mock("@/db/queries/resources", () => ({
  getResourcesNearPoint: (
    lat: number,
    lng: number,
    radius: number,
    type?: string,
  ) => mockNearPoint(lat, lng, radius, type) as Promise<ResourcePoint[]>,
}));

/** A due-east run along the 39.0 parallel; ~86.6 km per degree of longitude. */
const COORDS: LatLng[] = [
  { lat: 39.0, lng: -77.0 },
  { lat: 39.0, lng: -76.0 },
];

/**
 * Build a route over {@link COORDS}.
 */
function route(distance: number): Route {
  return {
    id: "r1",
    geometry: "",
    coordinates: COORDS,
    distance,
    duration: 3600,
    legs: [],
    summary: "US-40",
  };
}

/** A station ~26 km east of the start, on the line. */
const STATION: ResourcePoint = {
  id: "osm-1",
  type: "fuel",
  name: "Wawa",
  lat: 39.0,
  lng: -76.7,
  address: null,
  metadata: {},
  source: "osm",
  fetchedAt: 0,
  regionId: "md",
};

/** Metres per degree of longitude at 39°N, near enough for the fixtures. */
const PER_DEGREE = 86_600;

beforeEach(() => {
  mockNearPoint.mockReset();
  mockNearPoint.mockResolvedValue([STATION]);
  useRouteStore.getState().clearRoute();
});

describe("useFuelRange", () => {
  it("reports nothing until the driver gives a range", async () => {
    const { result } = await renderHook(() =>
      useFuelRange(route(86_600), { lat: 39.0, lng: -77.0 }),
    );

    expect(result.current.rangeRemaining).toBe(null);
    expect(result.current.warn).toBe(false);
    expect(mockNearPoint).not.toHaveBeenCalled();
  });

  it("retries a failed lookup on the next tick, not 20 km later", async () => {
    // The first lookup fails — a cold database, a read mid-write. The second
    // succeeds. What must not happen is the search anchor moving on the failed
    // attempt, which would leave the driver with no station list, and so no
    // banner, until they had covered another 20 km.
    mockNearPoint.mockRejectedValueOnce(new Error("no table yet"));
    mockNearPoint.mockResolvedValue([STATION]);

    useRouteStore.getState().setFuelRange(40_000);

    const { result, rerender } = await renderHook(
      ({ p }: { p: LatLng }) => useFuelRange(route(86_600), p),
      { initialProps: { p: { lat: 39.0, lng: -77.0 } } },
    );

    await waitFor(() => {
      expect(mockNearPoint).toHaveBeenCalledTimes(1);
    });
    expect(result.current.stop).toBe(null);

    // A few metres on: the next tick retries, well inside the 20 km anchor.
    await act(async () => {
      rerender({ p: { lat: 39.0, lng: -76.9999 } });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.stop?.resource.id).toBe("osm-1");
    });
  });

  it("does not re-read the station list on every GPS tick", async () => {
    useRouteStore.getState().setFuelRange(40_000);

    const { result, rerender } = await renderHook(
      ({ p }: { p: LatLng }) => useFuelRange(route(86_600), p),
      { initialProps: { p: { lat: 39.0, lng: -77.0 } } },
    );

    await waitFor(() => {
      expect(result.current.stop).not.toBe(null);
    });

    for (let i = 1; i <= 5; i++) {
      await act(async () => {
        rerender({ p: { lat: 39.0, lng: -77.0 + i * 0.0001 } });
        await Promise.resolve();
      });
    }

    expect(result.current.stop?.resource.id).toBe("osm-1");
    expect(mockNearPoint).toHaveBeenCalledTimes(1);
  });

  it("spends range on the distance actually driven", async () => {
    useRouteStore.getState().setFuelRange(100_000);

    const { result, rerender } = await renderHook(
      ({ p }: { p: LatLng }) => useFuelRange(route(86_600), p),
      { initialProps: { p: { lat: 39.0, lng: -77.0 } } },
    );

    await waitFor(() => {
      expect(result.current.rangeRemaining).toBe(100_000);
    });

    // 0.1° east: ~8.66 km driven.
    await act(async () => {
      rerender({ p: { lat: 39.0, lng: -76.9 } });
      await Promise.resolve();
    });

    expect(result.current.rangeRemaining).toBeLessThan(92_000);
    expect(result.current.rangeRemaining).toBeGreaterThan(90_500);
  });

  it("does not hand the range back when a reroute replaces the route", async () => {
    useRouteStore.getState().setFuelRange(100_000);

    const { result, rerender } = await renderHook(
      ({ p, r }: { p: LatLng; r: Route }) => useFuelRange(r, p),
      {
        initialProps: {
          p: { lat: 39.0, lng: -77.0 },
          r: route(86_600),
        },
      },
    );

    await waitFor(() => {
      expect(result.current.rangeRemaining).toBe(100_000);
    });

    // Drive 0.2°: ~17.3 km.
    await act(async () => {
      rerender({ p: { lat: 39.0, lng: -76.8 }, r: route(86_600) });
      await Promise.resolve();
    });
    const afterDriving = result.current.rangeRemaining ?? 0;
    expect(afterDriving).toBeLessThan(84_000);

    // A reroute hands over a shorter route that starts where the driver is, so
    // progress along the route is back to zero. The fuel burnt is not.
    await act(async () => {
      rerender({
        p: { lat: 39.0, lng: -76.8 },
        r: { ...route(0.2 * PER_DEGREE), id: "r2" },
      });
      await Promise.resolve();
    });

    expect(result.current.rangeRemaining).toBeLessThanOrEqual(afterDriving);
  });

  it("ignores GPS jitter below a few metres", async () => {
    useRouteStore.getState().setFuelRange(100_000);

    const { result, rerender } = await renderHook(
      ({ p }: { p: LatLng }) => useFuelRange(route(86_600), p),
      { initialProps: { p: { lat: 39.0, lng: -77.0 } } },
    );

    await waitFor(() => {
      expect(result.current.rangeRemaining).toBe(100_000);
    });

    // ~0.5 m of wobble, thirty times over: a parked car must not burn fuel.
    for (let i = 1; i <= 30; i++) {
      await act(async () => {
        rerender({
          p: { lat: 39.0, lng: -77.0 + (i % 2) * 0.000005 },
        });
        await Promise.resolve();
      });
    }

    expect(result.current.rangeRemaining).toBe(100_000);
  });
});
