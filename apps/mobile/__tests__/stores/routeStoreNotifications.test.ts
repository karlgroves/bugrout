/**
 * What a GPS tick costs the rest of the app (#189).
 *
 * #189's second clause is "Stop is slow to respond", with taps lagging
 * elsewhere just after navigation, and its Direction asks to "profile the
 * navigation screen's render and JS load, and fix whatever keeps the JS thread
 * busy". This is the mechanism that was found.
 *
 * `NavigationController.onPositionUpdate` calls
 * `useRouteStore.getState().setCurrentManeuverIndex(...)` once per position
 * update, and `setDeviated(true)` on every tick the driver is off route. Most
 * ticks carry the value the store already holds. Zustand's `set` replaces the
 * state object regardless, so every subscriber that reads the store without a
 * selector was woken and re-rendered for a change that did not happen — the
 * navigation screen, and the map tab behind it, which stays mounted under the
 * tab navigator throughout.
 *
 * Two independent fixes, both pinned here:
 *   1. the setters return early when the value has not changed, which helps
 *      every subscriber including the ones not touched in that pass;
 *   2. the screens in the per-tick path read through selectors, so a write to
 *      a field they do not display costs them nothing.
 */

import { useRouteStore } from "@/stores/useRouteStore";

import type { Route } from "@bugrout/shared";

const ROUTE = {
  id: "r1",
  distance: 1000,
  duration: 600,
  coordinates: [
    { lat: 39.29, lng: -76.61 },
    { lat: 39.3, lng: -76.6 },
  ],
  legs: [],
} as unknown as Route;

beforeEach(() => {
  useRouteStore.getState().clearRoute();
});

describe("a tick that changes nothing", () => {
  it("does not notify subscribers when the maneuver index is unchanged", () => {
    useRouteStore.getState().setCurrentManeuverIndex(2);

    const listener = jest.fn();
    const unsubscribe = useRouteStore.subscribe(listener);
    useRouteStore.getState().setCurrentManeuverIndex(2);
    useRouteStore.getState().setCurrentManeuverIndex(2);
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not notify subscribers when the deviation flag is unchanged", () => {
    useRouteStore.getState().setDeviated(true);

    const listener = jest.fn();
    const unsubscribe = useRouteStore.subscribe(listener);
    // The controller sets this on every tick it finds the driver off route.
    useRouteStore.getState().setDeviated(true);
    useRouteStore.getState().setDeviated(true);
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });

  it("still notifies when the value really changes", () => {
    const listener = jest.fn();
    const unsubscribe = useRouteStore.subscribe(listener);
    useRouteStore.getState().setCurrentManeuverIndex(1);
    useRouteStore.getState().setDeviated(true);
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(useRouteStore.getState().currentManeuverIndex).toBe(1);
    expect(useRouteStore.getState().hasDeviated).toBe(true);
  });
});

describe("a tick that advances the maneuver", () => {
  it("leaves a selector on an unrelated field untouched", () => {
    useRouteStore.getState().setRoute(ROUTE);

    // What the navigation screen and the map screen actually read.
    const seen: (Route | null)[] = [];
    const unsubscribe = useRouteStore.subscribe((state, previous) => {
      if (state.activeRoute !== previous.activeRoute) {
        seen.push(state.activeRoute);
      }
    });

    useRouteStore.getState().setCurrentManeuverIndex(1);
    useRouteStore.getState().setCurrentManeuverIndex(2);
    useRouteStore.getState().setDeviated(true);
    unsubscribe();

    // A real index change does replace the state object, so a whole-store
    // subscriber re-renders. A subscriber reading `activeRoute` must not.
    expect(seen).toEqual([]);
    expect(useRouteStore.getState().activeRoute).toBe(ROUTE);
  });
});
