/**
 * Hook for route calculation and active navigation state.
 */

import { useCallback } from "react";
import type { LatLng, RouteOptions, ResourceStopPreference } from "@bugrout/shared";
import { useRouteStore } from "@/stores/useRouteStore";
import * as RouteEngine from "@/services/routing/RouteEngine";

export function useRoute() {
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
