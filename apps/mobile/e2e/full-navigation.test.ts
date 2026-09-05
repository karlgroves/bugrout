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
 * Everything past destination selection needs three things this environment
 * does not supply: a geocoding answer, a GPS fix (`confirmRoute` refuses
 * without `position`, and the AVD boots with no location set), and routing
 * tiles. Those behaviours are covered off-device instead — RouteEngine.test.ts,
 * RouteEngineIntegration.test.ts, NavigationController.test.ts. What is left
 * here is what a real boot on this emulator can actually prove, which is the
 * same line navigation-flow.test.ts already draws for the same reasons.
 *
 * Restoring the deep journey needs a deterministic harness — a stubbed
 * geocoder, a seeded emulator location, and a routing fallback the spec can
 * rely on — not more assertions against live services. Tracked in #131.
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
