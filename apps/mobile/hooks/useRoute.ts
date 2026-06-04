/**
 * Hook for route calculation and active navigation state.
 */

import { useCallback } from "react";

import * as RouteEngine from "@/services/routing/RouteEngine";
import { useRouteStore } from "@/stores/useRouteStore";

import type { LatLng, Route, RouteOptions, ResourceStopPreference } from "@bugrout/shared";

/** Route store state plus the imperative route actions from {@link useRoute}. */
export type UseRouteResult = ReturnType<typeof useRouteStore.getState> & {
  calculateRoute: (
    origin: LatLng,
    destination: LatLng,
    options?: RouteOptions,
  ) => Promise<Route>;
  calculateRouteWithStops: (
    origin: LatLng,
    destination: LatLng,
    resourcePreferences: ResourceStopPreference[],
    options?: RouteOptions,
  ) => Promise<Route>;
  reroute: (currentPosition: LatLng) => Promise<Route | undefined>;
  checkDeviation: (currentPosition: LatLng) => boolean;
};

/* eslint-disable max-lines-per-function -- pre-existing; tracked in docs/tech-debt.md (useRoute bundles several memoized route actions) */
/**
 * Expose route-store state together with route calculation, rerouting,
 * and deviation-check helpers.
 */
export function useRoute(): UseRouteResult {
  const store = useRouteStore();

  /**
   * Calculate a basic route with threat avoidance.
   */
  const calculateRoute = useCallback(
    async (origin: LatLng, destination: LatLng, options?: RouteOptions) => {
      store.setStatus("calculating");
      store.setDestination(destination);

      try {
        const route = await RouteEngine.calculateSmartRoute(
          origin,
          destination,
          undefined,
          options,
        );
        store.setRoute(route);
        return route;
      } catch (error) {
        store.setStatus("error");
        throw error;
      }
    },
    [store],
  );

  /**
   * Calculate a route with resource stop preferences (for scenario activation).
   */
  const calculateRouteWithStops = useCallback(
    async (
      origin: LatLng,
      destination: LatLng,
      resourcePreferences: ResourceStopPreference[],
      options?: RouteOptions,
    ) => {
      store.setStatus("calculating");
      store.setDestination(destination);

      try {
        const route = await RouteEngine.calculateSmartRoute(
          origin,
          destination,
          resourcePreferences,
          options,
        );
        store.setRoute(route);
        return route;
      } catch (error) {
        store.setStatus("error");
        throw error;
      }
    },
    [store],
  );

  const reroute = useCallback(
    async (currentPosition: LatLng) => {
      if (!store.destination) return;
      store.setStatus("rerouting");
      store.setDeviated(false);
      return calculateRoute(currentPosition, store.destination);
    },
    [store, calculateRoute],
  );

  const checkDeviation = useCallback(
    (currentPosition: LatLng) => {
      if (!store.activeRoute) return false;
      const deviated = RouteEngine.hasDeviated(
        currentPosition,
        store.activeRoute.coordinates,
      );
      store.setDeviated(deviated);
      return deviated;
    },
    [store],
  );

  return {
    ...store,
    calculateRoute,
    calculateRouteWithStops,
    reroute,
    checkDeviation,
  };
}
