import { create } from "zustand";

import type { Route, RouteStatus, LatLng } from "@bugrout/shared";

/** Which view of a route is showing: the map or the directions list (#192). */
export type RouteView = "map" | "directions";

/**
 *
 */
interface RouteState {
  activeRoute: Route | null;
  status: RouteStatus;
  /** Index of the current maneuver in the active route */
  currentManeuverIndex: number;
  /** Whether the user has deviated from the route */
  hasDeviated: boolean;
  /** Destination for the current route */
  destination: LatLng | null;
  /** Map or directions list; chosen on the preview, kept for the trip (#192). */
  routeView: RouteView;

  /**
   * Store a calculated route. It is `previewing` until {@link startNavigation},
   * except while rerouting, when the new route replaces the one being driven
   * and stays `active`.
   */
  setRoute: (route: Route) => void;
  /** The user pressed Go: the previewed route becomes the active trip. */
  startNavigation: () => void;
  setStatus: (status: RouteStatus) => void;
  setCurrentManeuverIndex: (index: number) => void;
  setDeviated: (deviated: boolean) => void;
  setDestination: (dest: LatLng | null) => void;
  setRouteView: (view: RouteView) => void;
  clearRoute: () => void;
}

export /**
 *
 */
const useRouteStore = create<RouteState>((set) => ({
  activeRoute: null,
  status: "idle",
  currentManeuverIndex: 0,
  hasDeviated: false,
  destination: null,
  routeView: "map",

  setRoute: (route) => {
    set((state) => ({
      activeRoute: route,
      status: state.status === "rerouting" ? "active" : "previewing",
      currentManeuverIndex: 0,
    }));
  },
  startNavigation: () => {
    set({ status: "active" });
  },
  setStatus: (status) => {
    set({ status });
  },
  setCurrentManeuverIndex: (index) => {
    set({ currentManeuverIndex: index });
  },
  setDeviated: (deviated) => {
    set({ hasDeviated: deviated });
  },
  setDestination: (dest) => {
    set({ destination: dest });
  },
  setRouteView: (view) => {
    set({ routeView: view });
  },
  clearRoute: () => {
    set({
      activeRoute: null,
      status: "idle",
      currentManeuverIndex: 0,
      hasDeviated: false,
      destination: null,
      routeView: "map",
    });
  },
}));
