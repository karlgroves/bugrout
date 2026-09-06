/**
 * E2E Test: Destination picker — the reachable half of the 3-tap journey.
 *
 * This spec used to drive the whole journey: search "Los Angeles", tap the
 * first result, Route & Go, route preview, start navigation, stop. It cannot,
 * and the artifacts from E2E run 33691459602 show why on both counts.
 *
 * The search returns nothing. Geocoding goes to Nominatim over the network
 * (services/geocoding/Geocoder.ts) and a headless CI emulator gets no answer
 * from it; `searchAddress` turns the failure into an empty result list, so the
 * picker stayed blank with the query still in the field. The three steps before
 * the first failure "passed" only because `by.text(/Los Angeles/)` matched that
 * field's own text — Detox hands a RegExp to Espresso as a whole-string
 * pattern, and the field held exactly "Los Angeles". So the spec asserted a
 * result list it never had and then tapped the search box believing it was a
 * result, which is why `route-and-go-button` had nothing to route to.
 *
 * And the tap on `route-and-go-button` would not have landed anyway: typing
 * raises the keyboard over it, and the IME receives the touch while Espresso
 * reports the click as performed. That half is fixed for good in
 * support/input.ts, and this spec no longer types at all.
 *
 * Everything past destination selection needs two things this environment does
 * not supply: a geocoding answer and routing tiles. Those behaviours are
 * covered off-device instead — RouteEngine.test.ts,
 * RouteEngineIntegration.test.ts, NavigationController.test.ts. What is left
 * here is what a real boot on this emulator can actually prove, which is the
 * same line navigation-flow.test.ts already draws for the same reasons.
 *
 * Two, not three. #130 named a GPS fix as the third, on the reasoning that
 * `confirmRoute` refuses without `position` and the AVD boots with no location
 * set. The first half is true and the second half is not, and the difference
 * was never measured until #133 measured it: the emulator supplies a position
 * without being asked. `adb emu geo fix` was added, the suite went green, and
 * then the same suite went green again on a control run with the fix removed —
 * so the seeding was doing nothing and the "blocker" had never existed. The
 * assertion below is what is left of that experiment, kept because it pins the
 * fact; the workflow change is gone.
 *
 * Restoring the deep journey therefore needs less than #131 assumed — a
 * destination reachable without geocoding (a saved scenario, or the map-pin
 * path) and a routing fallback the spec can rely on. Not more assertions
 * against live services. Tracked in #131.
 *
 * The file keeps its name while the describe block does not. #131 puts the
 * full journey back here, and renaming twice would cost the history that
 * explains why it left.
 */

import { by, device, element, expect, waitFor } from "detox";

import { launchToMapScreen } from "./support/launch";

describe("Destination Picker", () => {
  beforeAll(async () => {
    await launchToMapScreen();
  });

  it("shows the map screen with Bug Out FAB", async () => {
    await expect(element(by.id("bug-out-fab"))).toBeVisible();
  });

  it("opens destination picker", async () => {
    await element(by.id("bug-out-fab")).tap();
    // The picker presents as a modal; wait out the slide-in before asserting.
    await waitFor(element(by.id("destination-search-input")))
      .toBeVisible()
      .withTimeout(10000);
  });

  it("acquires a position", async () => {
    // "a position", not "a GPS position": all this observes is that `position`
    // is non-null. Which provider supplied it is invisible from here, and the
    // finding below makes the fused or default provider likelier than GPS.
    //
    // Pins the fact the docblock above corrects: this emulator does supply a
    // position, with nothing seeding it. Measured twice — 661ms with an
    // `adb emu geo fix` in the workflow and 332ms on a control run without one
    // — which is what showed the seeding to be doing nothing.
    //
    // It does not guard the seeding, because there is none to guard. What it
    // guards is the precondition every later step of #131 rests on: if this
    // ever goes red, the journey work stops being worth attempting and the
    // reason will be right here rather than three specs downstream.
    //
    // app/destination/index.tsx renders four status lines. Three can reach the
    // screen at this point — "Getting your location..." while the request is in
    // flight, "Location unavailable — tap to retry" once it has failed, and
    // this one only when `position` is non-null. The fourth, "Ready to route",
    // needs a selected destination and there is none yet. So a failure here
    // says which of the other two happened rather than only that something went
    // wrong, and there is no fourth way to fail silently: getPosition always
    // sets an error on the catch path (hooks/useLocation.ts), so the state
    // where no line renders at all is unreachable.
    //
    // Generous timeout because this is the one assertion here that waits on the
    // platform rather than on React: getCurrentPositionAsync asks for
    // Accuracy.High and takes as long as the emulator's GPS takes.
    await waitFor(
      element(by.text("Search for an address or select a scenario above")),
    )
      .toBeVisible()
      .withTimeout(30000);
  });

  it("refuses to route with no destination selected", async () => {
    // The confirm button is deliberately always enabled and reports why it
    // cannot proceed (app/destination/index.tsx). That guard runs before the
    // location one, so this is the same result with or without a GPS fix — and
    // it proves the control is on screen and hit-testable, which is exactly
    // what the keyboard defect used to hide.
    await element(by.id("route-and-go-button")).tap();
    await waitFor(element(by.text("Select a destination first.")))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.text("OK")).tap();
  });

  it("returns to the map", async () => {
    await device.pressBack();
    await waitFor(element(by.id("bug-out-fab")))
      .toBeVisible()
      .withTimeout(10000);
  });
});
