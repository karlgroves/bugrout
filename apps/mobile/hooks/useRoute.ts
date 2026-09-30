/**
 * Hook for route calculation and active navigation state.
 */

import { useCallback } from "react";

import * as RouteEngine from "@/services/routing/RouteEngine";
import { useRouteStore } from "@/stores/useRouteStore";

import type {
  LatLng,
  Route,
  RouteOptions,
  ResourceStopPreference,
} from "@bugrout/shared";

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
  checkDeviation: (currentPosition: LatLng) => boolean;
};

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
    checkDeviation,
  };
}
