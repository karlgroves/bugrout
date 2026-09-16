/**
 * E2E Test: the full evacuation journey.
 *
 * Launch → Bug Out → pick a destination → Route & Go → route preview → Go →
 * navigating → Stop. This is the flow spec.md promises never exceeds three
 * taps, and it is the only place anything proves the screens after the picker
 * can be reached at all.
 *
 * ## Why it stops at the picker between #130 and this
 *
 * #130 cut the spec back to the destination picker, because the artifacts from
 * E2E run 33691459602 showed the second half could not run. It named three
 * blockers. One was real, one was fixable without touching the app, and one
 * was never true.
 *
 * **Geocoding — real, and still not addressed here.** `searchAddress` goes to
 * Nominatim (services/geocoding/Geocoder.ts), a headless CI emulator gets no
 * answer, and the failure becomes an empty result list, so the picker stayed
 * blank with the query still in the field. Worse, the three steps before the
 * first failure "passed" on nothing: `by.text(/Los Angeles/)` matched the
 * search field's own text, so the spec asserted a result list it never had and
 * then tapped the search box believing it was a result. Nothing below types.
 *
 * **A GPS fix — never true.** #133 measured it rather than assuming: the
 * emulator supplies a position with nothing seeding it, and an `adb emu geo
 * fix` added and then removed made no difference to either run. The assertion
 * that survives that experiment is still below.
 *
 * **Routing tiles — fixable, and fixed by not needing them.** ValhallaModule
 * has a mock-route fallback; what was missing was any evidence it worked
 * through the UI. It does, and both the preview and the navigation screen say
 * so in as many words, so the assertions on them are exact rather than
 * tolerant.
 *
 * ## How it runs offline now
 *
 * The journey needs a destination and a route. Both now come from the device:
 *
 * - **Destination** from a saved scenario the spec creates itself
 *   (support/scenario.ts), which reaches `selectedDest` with no network at all.
 *   That is #131's option 2, and it turned out to be enough on its own — no
 *   test-only seam in production code, which was option 3 and is still the
 *   thing to resist.
 * - **Route** from `buildMockRoute`, because Valhalla is never initialised at
 *   all. AppBootstrap gates `initValhalla` on `hasDownloadedTiles &&
 *   activeRegion`, and a spec that reinstalls the app has no downloaded tiles,
 *   so `config` stays null and `calculateRoute` returns the mock on its first
 *   branch. Measured, not assumed: the device log for E2E run 35141485633
 *   holds exactly one Valhalla line, "[BugRout] Valhalla not initialized —
 *   using mock route." No HTTP request is made, and localhost:8002 is never
 *   contacted — if tiles are ever seeded in CI, that changes and this note is
 *   the thing to re-check.
 *
 * Nothing here talks to a third-party service, which is the failure this spec
 * exists to stop repeating rather than to work around.
 *
 * ## The assertion that pins all of it
 *
 * The route preview reads "via Mock Route (Valhalla unavailable)", and this
 * spec asserts that string exactly. It is the whole point: it proves the
 * offline fallback is what produced the route, and it fails loudly the day
 * something gives CI a live routing service, which would quietly turn this
 * back into a test of somebody else's uptime.
 *
 * What is NOT covered, and is covered off-device instead: real Valhalla
 * responses and maneuver parsing (ValhallaModule.test.ts,
 * RouteEngine.test.ts, RouteEngineIntegration.test.ts), deviation and voice
 * (NavigationController.test.ts), and geocoding (Geocoder.test.ts).
 */

import { by, device, element, expect, waitFor } from "detox";

import { launchToMapScreen } from "./support/launch";
import { createScenario } from "./support/scenario";

const SCENARIO_NAME = "Inland Refuge";

describe("Full evacuation journey", () => {
  beforeAll(async () => {
    await launchToMapScreen();
  });

  it("shows the map screen with Bug Out FAB", async () => {
    await expect(element(by.id("bug-out-fab"))).toBeVisible();
  });

  it("saves a scenario to route to", async () => {
    // The destination, obtained without geocoding. Los Angeles, matching
    // scenarios.test.ts — the coordinates only have to be somewhere the
    // straight-line mock route can run to.
    await createScenario(SCENARIO_NAME, 34.0522, -118.2437);
    await waitFor(element(by.id("bug-out-fab")))
      .toBeVisible()
      .withTimeout(10000);
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
    // finding in #133 makes the fused or default provider likelier than GPS.
    //
    // Pins the fact the docblock above corrects: this emulator does supply a
    // position, with nothing seeding it. Measured twice — 661ms with an
    // `adb emu geo fix` in the workflow and 332ms on a control run without one
    // — which is what showed the seeding to be doing nothing.
    //
    // It is also the precondition for everything below: `confirmRoute` refuses
    // to route without `position`, so if this goes red the rest of this spec
    // fails for a reason that has nothing to do with the journey, and the
    // reason will be right here rather than three steps downstream.
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

  it("selects the saved scenario as the destination", async () => {
    await element(by.label(`Use scenario: ${SCENARIO_NAME}`)).tap();
    // "Ready to route" renders only when a destination AND a position are both
    // present, so it is the picker's own confirmation that the next tap can
    // succeed — the state the old spec believed it had reached by tapping its
    // own search field.
    await waitFor(element(by.text("Ready to route")))
      .toBeVisible()
      .withTimeout(10000);
  });

  it("routes to it, offline, and previews the route", async () => {
    await element(by.id("route-and-go-button")).tap();

    // Longer than the screens above: this waits on the whole routing pass —
    // the recent-destination write, the threat-avoidance polygons, and the
    // Valhalla call timing out against localhost:8002 before the mock route is
    // built. None of it is slow, but none of it is a single React render.
    await waitFor(element(by.id("route-preview-go-btn")))
      .toBeVisible()
      .withTimeout(30000);

    // Exactly the string ValhallaModule's buildMockRoute puts in `summary`.
    // This is the assertion the whole spec is arranged around: it proves the
    // route came from the offline fallback rather than from a routing service
    // CI reached over the network. If CI ever gets a real Valhalla, this line
    // is supposed to fail.
    //
    // `toBeVisible`, not `toExist`, and the difference is load-bearing here.
    // This assertion spent one commit as `toExist` because Espresso found the
    // view with this exact text and reported it "0 percent visible": the
    // preview's info ScrollView was collapsed to zero height. That is the bug
    // this suite found on its first real run (E2E 35137927287), and the styles
    // in app/route-preview/index.tsx now explain it. Asserting visibility is
    // what keeps it fixed.
    await expect(
      element(by.text("via Mock Route (Valhalla unavailable)")),
    ).toBeVisible();

    // The rest of the panel, because the defect hid all of it and one visible
    // line would not have caught it. These are the three things spec.md
    // requires this screen to show — the numbers, and the disclaimer that is a
    // legal requirement rather than decoration. Threat warnings are the fourth
    // and cannot be asserted here: an offline CI emulator has no threat data,
    // so the warning box is correctly absent.
    //
    // Labels, not values: the distance and ETA depend on wherever the emulator
    // thinks it is, which is not something this spec should pin.
    await expect(element(by.text("Distance"))).toBeVisible();
    await expect(element(by.text("ETA"))).toBeVisible();
    await expect(
      element(
        by.text(
          "BugRout provides advisory routing only. Do not rely solely on this app for life-safety decisions. Always follow official evacuation orders.",
        ),
      ),
    ).toBeVisible();
  });

  it("starts navigation", async () => {
    await element(by.id("route-preview-go-btn")).tap();

    // The advisory badge is a spec requirement — it has to be visible for the
    // whole of navigation — and it is also the cheapest proof that the
    // navigation screen mounted rather than bouncing back (it calls
    // router.back() immediately when there is no active route).
    await waitFor(element(by.text("ADVISORY ONLY")))
      .toBeVisible()
      .withTimeout(20000);

    // The mock route's street name, shown by the maneuver card. Two things at
    // once: the route survived the store round trip into the card rather than
    // leaving it on its "Calculating route..." empty state, and — since only
    // buildMockRoute writes "Mock Route" — the offline fallback is what the
    // user is being navigated along. That is the visible half of the claim the
    // preview step can currently only assert exists.
    //
    // Not the instruction text. The first maneuver is `depart`, positioned at
    // the origin, so the first GPS update is already within the 30m
    // MANEUVER_PASSED_THRESHOLD and the controller advances to "Continue
    // straight" before this line runs — which E2E run 35137927287 caught by
    // failing on "Head toward your destination". The street name is the same
    // on both, so it does not race the advance.
    await expect(element(by.text("Mock Route"))).toBeVisible();

    // Deliberately nothing here asserts on position, distance or ETA. A
    // standard AVD has no magnetometer, so watchHeadingAsync can reject and
    // take startTracking's position subscription down with it; the screen
    // renders from the route either way. Live-position behaviour is
    // NavigationController.test.ts's job, off-device and deterministic.
    await expect(element(by.id("status-indicator"))).toBeVisible();
  });

  it("stops navigation and returns to the map", async () => {
    await element(by.id("stop-navigation-btn")).tap();
    // Stop clears the route and pops the stack. The FAB pushed the picker,
    // and then the preview replaced the picker and navigation replaced the
    // preview — both router.replace — so the only thing under navigation is
    // the map.
    await waitFor(element(by.id("bug-out-fab")))
      .toBeVisible()
      .withTimeout(15000);
  });

  it("records the trip as a recent destination", async () => {
    // The journey's only persistent side effect: confirmRoute writes the
    // selected destination to SQLite before it routes. Seeing it come back on
    // a later mount of the picker is end-to-end proof the write happened and
    // survived — the one thing about this flow that outlives the session.
    //
    // It also proves the app is still usable after a navigation session, which
    // is not a given: navigation holds a GPS and a heading subscription, and a
    // stop() that failed to release them would show up as a wedged screen here
    // rather than anywhere in the steps above.
    await element(by.id("bug-out-fab")).tap();
    await waitFor(element(by.label(`Use recent destination: ${SCENARIO_NAME}`)))
      .toBeVisible()
      .withTimeout(15000);
    await device.pressBack();
    await waitFor(element(by.id("bug-out-fab")))
      .toBeVisible()
      .withTimeout(10000);
  });
});
