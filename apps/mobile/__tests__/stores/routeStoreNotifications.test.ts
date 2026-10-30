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
 * Two independent fixes:
 *   1. the setters return early when the value has not changed, which helps
 *      every subscriber including the ones not touched in that pass — pinned
 *      here;
 *   2. the screens in the per-tick path read through selectors, so a write to
 *      a field they do not display costs them nothing — pinned by
 *      `screens/navigationSubscriptions.test.ts`.
 */

import { useRouteStore } from "@/stores/useRouteStore";

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
