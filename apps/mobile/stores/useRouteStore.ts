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

  setRoute: (route: Route) => void;
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
    set({ activeRoute: route, status: "active", currentManeuverIndex: 0 });
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
