import { create } from "zustand";

import type { DroppedStop, Route, RouteStatus, LatLng } from "@bugrout/shared";

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
   * How far the driver said they can drive on the fuel they have, in metres,
   * or `null` when they skipped the question. Trip-scoped: a tank is a fact
   * about this drive, not a setting, so it clears with the route (#203).
   */
  fuelRangeMeters: number | null;
  /**
   * Resource stops the driver asked for that this route does not include, and
   * why (#341). Replaced on every calculation and cleared with the route, so
   * it always describes the route currently in hand.
   */
  droppedStops: DroppedStop[];

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
  /** Record the driver's stated range, or `null` when they skip it (#203). */
  setFuelRange: (meters: number | null) => void;
  /** Record the stops this route left out, or `[]` when it left out none. */
  setDroppedStops: (dropped: DroppedStop[]) => void;
  clearRoute: () => void;
}

export /**
 *
 */
const useRouteStore = create<RouteState>((set, get) => ({
  activeRoute: null,
  status: "idle",
  currentManeuverIndex: 0,
  hasDeviated: false,
  destination: null,
  routeView: "map",
  fuelRangeMeters: null,
  droppedStops: [],

  setRoute: (route) => {
    set((state) => ({
      activeRoute: route,
      status: state.status === "rerouting" ? "active" : "previewing",
      currentManeuverIndex: 0,
      // A new route (including a reroute) starts on route (#298).
      hasDeviated: false,
    }));
  },
  startNavigation: () => {
    set({ status: "active" });
  },
  setStatus: (status) => {
    set({ status });
  },
  /*
   * These two are written on every GPS tick — NavigationController calls
   * `setCurrentManeuverIndex` once per position update, and `setDeviated` on
   * every tick with whether the driver is off route (#298). Most ticks carry
   * the same value as the last, but `set` replaces the state object
   * regardless, so every subscriber that is not reading through a selector is
   * woken up and re-rendered for a change that did not happen (#189, "Stop is
   * slow to respond"; taps elsewhere lagged the same way just after navigation).
   *
   * So they return early when nothing changed. That is a store-level fix for
   * everything subscribed, not only the navigation screen.
   */
  setCurrentManeuverIndex: (index) => {
    if (get().currentManeuverIndex === index) return;
    set({ currentManeuverIndex: index });
  },
  setDeviated: (deviated) => {
    if (get().hasDeviated === deviated) return;
    set({ hasDeviated: deviated });
  },
  setDestination: (dest) => {
    set({ destination: dest });
  },
  setRouteView: (view) => {
    set({ routeView: view });
  },
  setFuelRange: (meters) => {
    set({ fuelRangeMeters: meters });
  },
  setDroppedStops: (dropped) => {
    set({ droppedStops: dropped });
  },
  clearRoute: () => {
    set({
      activeRoute: null,
      status: "idle",
      currentManeuverIndex: 0,
      hasDeviated: false,
      destination: null,
      routeView: "map",
      fuelRangeMeters: null,
      droppedStops: [],
    });
  },
}));
