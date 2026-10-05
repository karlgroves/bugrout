/**
 * E2E Test: the full evacuation journey.
 *
 * Launch → Bug Out → pick a destination → route preview → Go → navigating →
 * Stop. This is the flow spec.md promises never exceeds three taps (§7.2), and
 * the spec counts them: Bug Out, the destination, Go (#197). It is also the
 * only place anything proves the screens after the picker can be reached.
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
 * **Routing — now a recorded real route.** This spec used to get its route
 * from ValhallaModule's made-up straight-line fallback, and asserted "via Mock
 * Route (Valhalla unavailable)" to prove it. That fallback was the product
 * defect in #190 — it presented an invented route as real — and it is gone.
 *
 * ## How it runs offline now
 *
 * The journey needs a destination and a route. Neither touches a third-party
 * service:
 *
 * - **Destination** from a saved scenario the spec creates itself
 *   (support/scenario.ts), which reaches `selectedDest` with no network at all.
 *   That is #131's option 2.
 * - **Route** from the Valhalla replay server (support/valhalla-replay-server.js),
 *   which globalSetup.js starts on the host and launchToMapScreen forwards the
 *   emulator's localhost:8002 to. It returns a response recorded from the live
 *   routing server when the request's endpoints match a recording, and the
 *   live server's out-of-coverage error otherwise. The emulator is placed at
 *   the recording's origin and the scenario at its destination, so the app
 *   sends exactly the recorded request.
 *
 * ## The assertion that pins all of it
 *
 * The route preview reads "via North Calvert Street" — the summary the app
 * builds from the recorded Baltimore route. It proves the route came through
 * the real parsing path from a real response, rather than being invented, and
 * it fails if the app ever routes somewhere other than the recording.
 *
 * What is NOT covered, and is covered off-device instead: each routing
 * failure reason (RouteUnavailable.test.ts; the out-of-coverage one also
 * end-to-end in routing-unavailable.test.ts), maneuver positions and advance
 * along a real route (ValhallaManeuvers.test.ts), and geocoding
 * (Geocoder.test.ts).
 */

import { by, device, element, expect, waitFor } from "detox";

import { DISCLAIMER_SHORT } from "../constants/legal";

import { launchToMapScreen } from "./support/launch";
import { createScenario } from "./support/scenario";

const SCENARIO_NAME = "Inland Refuge";

/** Taps from the map to active navigation; spec §7.2 allows three. */
let journeyTaps = 0;

/** The recorded route's endpoints — e2e/fixtures/valhalla-routes.json. */
const ORIGIN = { lat: 39.2904, lng: -76.6122 };
const DESTINATION = { lat: 39.3138, lng: -76.6021 };

describe("Full evacuation journey", () => {
  beforeAll(async () => {
    await launchToMapScreen();
    // At the recorded route's origin, so the app asks the replay server for
    // exactly the recorded request.
    await device.setLocation(ORIGIN.lat, ORIGIN.lng);
  });

  it("shows the map screen with Bug Out FAB", async () => {
    await expect(element(by.id("bug-out-fab"))).toBeVisible();
  });

  it("saves a scenario to route to", async () => {
    // The destination, obtained without geocoding: the recorded route's end.
    await createScenario(SCENARIO_NAME, DESTINATION.lat, DESTINATION.lng);
    await waitFor(element(by.id("bug-out-fab")))
      .toBeVisible()
      .withTimeout(10000);
  });

  it("opens destination picker", async () => {
    // Tap 1.
    await element(by.id("bug-out-fab")).tap();
    journeyTaps += 1;
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
    // It is also the precondition for everything below: routing needs
    // `position`, so if this goes red the rest of this spec fails for a reason
    // that has nothing to do with the journey, and the reason will be right
    // here rather than three steps downstream.
    //
    // app/destination/index.tsx renders three status lines: "Getting your
    // location..." while the request is in flight, "Location unavailable —
    // tap to retry" once it has failed, and this one only when `position` is
    // non-null and nothing is selected yet. So a failure here says which of
    // the other two happened rather than only that something went wrong, and
    // there is no fourth way to fail silently: getPosition always sets an
    // error on the catch path (hooks/useLocation.ts), so the state where no
    // line renders at all is unreachable.
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

  it("routes to the saved scenario, offline, and previews the route", async () => {
    // Tap 2. Choosing the destination routes to it: there is no separate
    // "Route & Go" step any more (#197).
    await element(by.label(`Use scenario: ${SCENARIO_NAME}`)).tap();
    journeyTaps += 1;

    // Longer than the screens above: this waits on the whole routing pass —
    // the recent-destination write, the threat-avoidance polygons, and the
    // request to the replay server. None of it is slow, but none of it is a
    // single React render.
    await waitFor(element(by.id("route-preview-go-btn")))
      .toBeVisible()
      .withTimeout(30000);

    // The summary the app builds from the recorded route: its one street
    // longer than a kilometre. This is the assertion the spec is arranged
    // around — the route came from a real response through the real parser.
    //
    // `toBeVisible`, not `toExist`, and the difference is load-bearing here.
    // This assertion spent one commit as `toExist` because Espresso found the
    // view with this exact text and reported it "0 percent visible": the
    // preview's info ScrollView was collapsed to zero height. That is the bug
    // this suite found on its first real run (E2E 35137927287), and the styles
    // in app/route-preview/index.tsx now explain it. Asserting visibility is
    // what keeps it fixed.
    await expect(element(by.text("via North Calvert Street"))).toBeVisible();

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

    // The imported constant, not a copy of its text. A pasted literal would
    // break this spec the day the wording changes — and constants/legal.ts is
    // not in e2e.yml's path filter, so that edit would not even run this job
    // to find out. Importing makes the assertion follow the source instead:
    // what it pins is that the screen still renders the disclaimer, which is
    // the part that is a legal requirement rather than the exact words.
    await expect(element(by.text(DISCLAIMER_SHORT))).toBeVisible();
  });

  it("starts navigation", async () => {
    // Tap 3, and the last: spec §7.2's hard limit from launch to navigation.
    await element(by.id("route-preview-go-btn")).tap();
    journeyTaps += 1;

    // The advisory badge is a spec requirement — it has to be visible for the
    // whole of navigation — and it is also the cheapest proof that the
    // navigation screen mounted rather than bouncing back (it calls
    // router.back() immediately when there is no active route).
    await waitFor(element(by.text("ADVISORY ONLY")))
      .toBeVisible()
      .withTimeout(20000);

    // The maneuver card's street: the route survived the store round trip
    // into the card rather than leaving it on "Calculating route...".
    //
    // Either of the first two maneuvers. The first is `depart` on East Fayette
    // Street, at the snapped origin; once a GPS update lands within 30 m of it,
    // the controller advances to "Bear right onto North Calvert Street". Which
    // one is showing depends on when the first update arrives (and a standard
    // AVD's missing magnetometer can stop updates altogether — see below), so
    // pinning one would race it. The regex is a full match in Espresso, so it
    // does not also match the instruction sentence.
    await waitFor(element(by.text(/^(East Fayette|North Calvert) Street$/)))
      .toBeVisible()
      .withTimeout(10000);

    // Deliberately nothing here asserts on position, distance or ETA. A
    // standard AVD has no magnetometer, so watchHeadingAsync can reject and
    // take startTracking's position subscription down with it; the screen
    // renders from the route either way. Live-position behaviour is
    // NavigationController.test.ts's job, off-device and deterministic.
    await expect(element(by.id("status-indicator"))).toBeVisible();

    // Detox's `expect` only takes elements, so the count is checked by hand.
    if (journeyTaps !== 3) {
      throw new Error(
        `Launch to navigation took ${String(journeyTaps)} taps; spec §7.2 allows 3`,
      );
    }
  });

  it("switches to the directions list mid-trip, keeping the essentials", async () => {
    // #192: the list replaces the map only; the advisory badge above and the
    // ETA and Stop below stay put, so the next test still ends the trip.
    await element(by.id("route-view-directions")).tap();
    await waitFor(element(by.id("directions-list")))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.text("ADVISORY ONLY"))).toBeVisible();
    await expect(element(by.id("stop-navigation-btn"))).toBeVisible();
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
    // The journey's only persistent side effect: routing writes the chosen
    // destination to SQLite before it routes. Seeing it come back on
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
