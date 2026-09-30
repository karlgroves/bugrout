import { create } from "zustand";

import type { Route, RouteStatus, LatLng } from "@bugrout/shared";

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
  clearRoute: () => {
    set({
      activeRoute: null,
      status: "idle",
      currentManeuverIndex: 0,
      hasDeviated: false,
      destination: null,
    });
  },
}));
