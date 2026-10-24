/**
 * Saved-scenario helper for the Detox specs.
 *
 * A plan is the one way to put a destination in front of the picker without
 * asking anything of the network. The other two inputs cannot run on a CI
 * emulator: address search goes to Nominatim (services/geocoding/Geocoder.ts)
 * and gets no answer from a datacenter IP, and recent destinations only exist
 * after a previous run has used one. That is the whole reason #130 narrowed the
 * journey spec and #131 could put it back — see full-navigation.test.ts.
 *
 * Since #187 the editor asks for an address rather than two coordinate fields,
 * so there is no longer a way to *type* a known destination offline. This hands
 * one to the editor through its `lat`/`lng` deep link instead. That is not
 * test-only scaffolding — it is how a destination reaches a new plan from
 * outside the app — but the suite is why it has to exist: the replay server
 * matches recorded endpoints to within 150 m, and a tap on the map cannot.
 *
 * Deliberately not shared with scenarios.test.ts, which walks the same screens.
 * That spec exists to test scenario creation, so its assertions sit between the
 * steps; folding them into a helper would leave it asserting nothing. This one
 * exists to *get past* creation, so it asserts only that it worked.
 */
import { by, device, element, waitFor } from "detox";

import { acceptCoverageWarning } from "./coverage";
import { fillField } from "./input";

/**
 * Create a saved scenario from the Scenarios tab and return to the map.
 *
 * Starts and ends on the map screen, so a spec can call it mid-flow.
 *
 * @param name - Plan name, which becomes its row's accessible name.
 * @param lat - Destination latitude.
 * @param lng - Destination longitude.
 */
export async function createScenario(
  name: string,
  lat: number,
  lng: number,
): Promise<void> {
  // Straight to the editor with the destination already set, which is the
  // only offline way to reach a point the replay server has a route for.
  await device.openURL({
    url: `bugrout://scenarios/edit?lat=${String(lat)}&lng=${String(lng)}`,
  });

  // fillField, not typeText: "Save Plan" is the last control on the editor
  // and the on-screen keyboard covers it, so a tap after typing is swallowed by
  // the IME while Espresso reports it as performed. See support/input.ts.
  await fillField(by.label("Plan name"), name);
  await element(by.text("Save Plan")).tap();

  // The save blocks on the coverage warning when the destination is outside
  // every downloaded region — which on CI is every destination, there being no
  // regions at all (#243). See support/coverage.ts.
  await acceptCoverageWarning();

  // The deep link opened the editor directly, so the list has to be reached
  // on the way out. Assert on the card's accessible name, not the bare plan
  // name: the latter also matches the editor's own name field, so it would
  // pass while the editor is still open and the save has done nothing.
  // "Edit plan: …" exists only on the list.
  await element(by.text("Plans")).tap();
  await waitFor(element(by.label(`Edit plan: ${name}`)))
    .toBeVisible()
    .withTimeout(10000);

  await element(by.text("Map")).tap();
}
