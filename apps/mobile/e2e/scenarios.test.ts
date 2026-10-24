/**
 * E2E Test: Scenario Management
 *
 * Tests creating, editing, and activating evacuation scenarios.
 */

import { by, element, expect, waitFor } from "detox";

import { acceptCoverageWarning } from "./support/coverage";
import { fillField } from "./support/input";
import { launchToMapScreen } from "./support/launch";

describe("Scenario Management", () => {
  beforeAll(async () => {
    await launchToMapScreen();
  });

  it("should navigate to the plans tab", async () => {
    await element(by.text("Plans")).tap();
    await expect(element(by.text("No Plans Saved"))).toBeVisible();
  });

  it("should open the plan editor", async () => {
    await element(by.text("Create Plan")).tap();
    await expect(element(by.label("Plan name"))).toBeVisible();
  });

  it("should create a new plan by dropping a pin", async () => {
    // The destination is an address now (#187), and an address cannot be
    // resolved from a CI emulator — Nominatim gives a datacenter IP no answer.
    // Dropping a pin is the path that needs no network, so it is the one this
    // spec walks, and it exercises more of the real flow than typing numbers
    // into two fields ever did.
    //
    // Which point the tap lands on does not matter here: this spec only needs
    // *a* destination, and the coverage warning below is raised either way.
    // A spec that needs a point the replay server has a route for cannot use
    // this path at all — see support/scenario.ts.
    await fillField(by.label("Plan name"), "Wildfire East");
    await element(by.text("Choose on map instead")).tap();
    await element(by.id("bugrout-map")).tap();
    // By testID, not label: by.label would match the Pressable and its own
    // child Text and fail as ambiguous (#114).
    await element(by.id("pick-location-confirm-btn")).tap();

    // fillField, not typeText. "Save Plan" is the last control on the
    // editor and the keyboard covers it, so the tap that used to follow the
    // typeText calls was swallowed by the IME and the editor never popped —
    // which is what took the "Map" tab away from the next test. See
    // support/input.ts.
    await element(by.text("Save Plan")).tap();

    // On CI no region is downloaded at all, so every save raises the coverage
    // warning (#243). See support/coverage.ts.
    await acceptCoverageWarning();

    // Assert on the card's accessible name, not on the bare scenario name.
    // `by.text("Wildfire East")` also matches the editor's own name field, so
    // it passed while the editor was still open and the save had done nothing
    // — the failure surfaced a test later, on a screen this spec had never
    // actually left. "Edit plan: …" exists only on the list.
    await waitFor(element(by.label("Edit plan: Wildfire East")))
      .toBeVisible()
      .withTimeout(10000);
  });

  it("should show the plan in the destination picker", async () => {
    await element(by.text("Map")).tap();
    await element(by.label("Bug Out — set evacuation destination")).tap();
    await waitFor(element(by.label("Use plan: Wildfire East")))
      .toBeVisible()
      .withTimeout(10000);
  });
});
