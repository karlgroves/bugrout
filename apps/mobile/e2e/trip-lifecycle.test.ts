/**
 * E2E Test: a trip can always be ended (#189).
 *
 * Two ways the map used to get stuck with a route drawn, the Bug Out button
 * hidden and no Stop anywhere:
 *
 * - backing out of the route preview, which left a route that was never
 *   started marked as an active trip;
 * - leaving the navigation screen with Android's back button, which stopped
 *   guidance but left the trip running.
 *
 * The destination and location are the recorded route's endpoints
 * (e2e/fixtures/valhalla-routes.json), so this routes the same way whether the
 * route comes from the replay server or not.
 */

import { by, device, element, expect, waitFor } from "detox";

import { launchToMapScreen } from "./support/launch";
import { createScenario } from "./support/scenario";

const SCENARIO_NAME = "Lifecycle";

/** From the map, pick the scenario and open the route preview. */
async function openPreview(): Promise<void> {
  await element(by.id("bug-out-fab")).tap();
  await waitFor(element(by.label(`Use scenario: ${SCENARIO_NAME}`)))
    .toBeVisible()
    .withTimeout(10000);
  await element(by.label(`Use scenario: ${SCENARIO_NAME}`)).tap();
  await waitFor(element(by.text("Ready to route")))
    .toBeVisible()
    .withTimeout(30000);
  await element(by.id("route-and-go-button")).tap();
  await waitFor(element(by.id("route-preview-go-btn")))
    .toBeVisible()
    .withTimeout(30000);
}

describe("Trip lifecycle", () => {
  beforeAll(async () => {
    await launchToMapScreen();
    await device.setLocation(39.2904, -76.6122);
    await createScenario(SCENARIO_NAME, 39.3138, -76.6021);
  });

  it("returns to a usable map when the preview is backed out of", async () => {
    await openPreview();

    await element(by.text("Back")).tap();

    // Bug Out is back, and no trip is claimed: nothing was started.
    await waitFor(element(by.id("bug-out-fab")))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id("trip-in-progress"))).not.toExist();
  });

  it("offers Resume and End trip after leaving navigation with back", async () => {
    if (device.getPlatform() !== "android") return;

    await openPreview();
    await element(by.id("route-preview-go-btn")).tap();
    await waitFor(element(by.text("ADVISORY ONLY")))
      .toBeVisible()
      .withTimeout(20000);

    await device.pressBack();

    await waitFor(element(by.id("trip-in-progress")))
      .toBeVisible()
      .withTimeout(10000);

    await element(by.id("trip-resume-btn")).tap();
    await waitFor(element(by.text("ADVISORY ONLY")))
      .toBeVisible()
      .withTimeout(20000);

    await device.pressBack();
    await waitFor(element(by.id("trip-end-btn")))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id("trip-end-btn")).tap();

    await waitFor(element(by.id("bug-out-fab")))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id("trip-in-progress"))).not.toExist();
  });
});
