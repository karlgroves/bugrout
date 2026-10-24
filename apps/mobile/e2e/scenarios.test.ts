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

  it("should navigate to scenarios tab", async () => {
    await element(by.text("Plans")).tap();
    await expect(element(by.text("No Plans Saved"))).toBeVisible();
  });

  it("should open scenario editor", async () => {
    await element(by.text("Create Plan")).tap();
    await expect(element(by.label("Plan name"))).toBeVisible();
  });

  it("should create a new scenario", async () => {
    // fillField, not typeText. "Save Plan" is the last control on the
    // editor and the keyboard covers it, so the tap that used to follow three
    // typeText calls was swallowed by the IME and the editor never popped —
    // which is what took the "Map" tab away from the next test. See
    // support/input.ts. Typing also duplicated a keystroke here: the artifact
    // screenshot for E2E run 33691459602 shows the longitude field reading
    // "-118.24373" after this spec typed "-118.2437".
    await fillField(by.label("Plan name"), "Wildfire East");
    await fillField(by.label("Destination latitude"), "34.0522");
    await fillField(by.label("Destination longitude"), "-118.2437");
    await element(by.text("Save Plan")).tap();

    // Los Angeles is outside Maryland, so this save raises the coverage
    // warning on a developer's device as well as on CI, where no region is
    // downloaded at all (#243). See support/coverage.ts.
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

  it("should show scenario in destination picker", async () => {
    await element(by.text("Map")).tap();
    await element(by.label("Bug Out — set evacuation destination")).tap();
    await waitFor(element(by.label("Use plan: Wildfire East")))
      .toBeVisible()
      .withTimeout(10000);
  });
});
