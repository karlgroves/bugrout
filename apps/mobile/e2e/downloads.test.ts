/**
 * E2E Test: Offline Maps Downloads
 */

import { by, element, expect, waitFor } from "detox";

import { launchToMapScreen } from "./support/launch";

describe("Offline Maps", () => {
  beforeAll(async () => {
    await launchToMapScreen();
  });

  it("navigates to downloads from settings", async () => {
    await element(by.text("Settings")).tap();
    await element(by.id("settings-row-offline-maps")).tap();
    // Addressed by testID. This assertion used to name the screen's intro
    // copy, and it named only the first sentence of it — the paragraph goes on
    // "Maps include routing data, fuel stations, water sources, and shelters."
    // in the same Text node, and `by.text` is an exact match, so it could not
    // hit. The screen was reached correctly the whole time; the artifact
    // screenshot for E2E run 33691459602 shows it fully rendered behind the
    // failure. `downloads-screen` is the handle navigation-flow.test.ts
    // already uses for the same screen.
    await expect(element(by.id("downloads-screen"))).toBeVisible();
  });

  it("shows storage info", async () => {
    // Runs before the scrolling test below: the storage bar is in the list
    // header, so it leaves the viewport as soon as anything scrolls.
    //
    // Addressed by testID rather than `by.text(/available/)`. Detox hands a
    // RegExp to Espresso as a pattern the whole string has to satisfy, so
    // /available/ did not match "Using 0 KB · 4.5 GB available" — it is a full
    // match, not a substring search.
    await expect(element(by.id("downloads-storage-info"))).toBeVisible();
  });

  it("shows available regions", async () => {
    // The catalogue is all 50 states in alphabetical order, so only the first
    // few fit on screen: "California" was visible and passed, "Texas" was ~35
    // rows below the fold and could not be. Scroll to each one instead, in
    // list order so the scrolling stays monotonic.
    for (const name of ["California", "Florida", "Texas"]) {
      await waitFor(element(by.text(name)))
        .toBeVisible()
        .whileElement(by.id("downloads-screen"))
        .scroll(400, "down");
    }
  });
});
