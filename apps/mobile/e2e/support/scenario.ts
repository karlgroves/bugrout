/**
 * Saved-scenario helper for the Detox specs.
 *
 * A scenario is the one way to put a destination in front of the picker
 * without asking anything of the network. The other two inputs cannot run on a
 * CI emulator: address search goes to Nominatim (services/geocoding/Geocoder.ts)
 * and gets no answer from a datacenter IP, and recent destinations only exist
 * after a previous run has used one. That is the whole reason #130 narrowed the
 * journey spec and #131 could put it back — see full-navigation.test.ts.
 *
 * Deliberately not shared with scenarios.test.ts, which walks the same screens.
 * That spec exists to test scenario creation, so its assertions sit between the
 * steps; folding them into a helper would leave it asserting nothing. This one
 * exists to *get past* creation, so it asserts only that it worked.
 */
import { by, element, waitFor } from "detox";

import { fillField } from "./input";

/**
 * Create a saved scenario from the Scenarios tab and return to the map.
 *
 * Starts and ends on the map screen, so a spec can call it mid-flow.
 *
 * @param name - Scenario name, which becomes its row's accessible name.
 * @param lat - Destination latitude.
 * @param lng - Destination longitude.
 */
export async function createScenario(
  name: string,
  lat: number,
  lng: number,
): Promise<void> {
  await element(by.text("Scenarios")).tap();
  await element(by.text("Create Scenario")).tap();

  // fillField, not typeText: "Save Scenario" is the last control on the editor
  // and the on-screen keyboard covers it, so a tap after typing is swallowed by
  // the IME while Espresso reports it as performed. See support/input.ts.
  await fillField(by.label("Scenario name"), name);
  await fillField(by.label("Destination latitude"), String(lat));
  await fillField(by.label("Destination longitude"), String(lng));
  await element(by.text("Save Scenario")).tap();

  // Assert on the card's accessible name, not the bare scenario name: the
  // latter also matches the editor's own name field, so it passes while the
  // editor is still open and the save has done nothing. "Edit scenario: …"
  // exists only on the list.
  await waitFor(element(by.label(`Edit scenario: ${name}`)))
    .toBeVisible()
    .withTimeout(10000);

  await element(by.text("Map")).tap();
}
