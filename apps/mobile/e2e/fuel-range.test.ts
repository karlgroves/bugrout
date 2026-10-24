/**
 * E2E Test: the fuel range question on the route preview (#203, spec §7.3).
 *
 * What this can prove, and what it deliberately does not:
 *
 * The banner itself needs fuel stations within the corridor ahead of the
 * driver, and those come from the region package (#200). A CI emulator has
 * **no region downloaded at all** — see e2e/support/coverage.ts, which exists
 * because of exactly that — so there are no stations to be near, and the
 * banner can never fire here. Asserting on it would be a spec that passes by
 * never running its interesting branch.
 *
 * So the threshold logic is covered by unit tests
 * (__tests__/services/FuelRange.test.ts) and the banner's rendering and
 * announcement by __tests__/components/FuelRangeWarning.test.tsx. What is
 * worth an E2E is the part a unit test cannot reach: that the question is
 * really on the preview, that it is genuinely optional, and that skipping it
 * leaves the three-tap flow unchanged and silent.
 *
 * The banner on a real route belongs with the device check in #142.
 */

import { by, device, element, expect, waitFor } from "detox";

import { launchToMapScreen } from "./support/launch";
import { createScenario } from "./support/scenario";

const SCENARIO_NAME = "Fuel";

/** From the map, pick the scenario and open the route preview. */
async function openPreview(): Promise<void> {
  await element(by.id("bug-out-fab")).tap();
  await waitFor(element(by.label(`Use scenario: ${SCENARIO_NAME}`)))
    .toBeVisible()
    .withTimeout(10000);
  await element(by.label(`Use scenario: ${SCENARIO_NAME}`)).tap();
  await waitFor(element(by.id("route-preview-go-btn")))
    .toBeVisible()
    .withTimeout(30000);
}

describe("Fuel range", () => {
  beforeAll(async () => {
    await launchToMapScreen();
    await device.setLocation(39.2904, -76.6122);
    await createScenario(SCENARIO_NAME, 39.3138, -76.6021);
  });

  it("asks for the range on the route preview, and starts out blank", async () => {
    await openPreview();

    await waitFor(element(by.id("fuel-range-input")))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id("fuel-range-input"))).toHaveText("");

    await element(by.text("Back")).tap();
    await waitFor(element(by.id("bug-out-fab")))
      .toBeVisible()
      .withTimeout(10000);
  });

  it("takes a range without blocking Go", async () => {
    await openPreview();

    await element(by.id("fuel-range-input")).typeText("120");
    await element(by.id("fuel-range-input")).tapReturnKey();

    // The question is optional and never gates the trip: Go is still there.
    await expect(element(by.id("route-preview-go-btn"))).toBeVisible();

    await element(by.text("Back")).tap();
    await waitFor(element(by.id("bug-out-fab")))
      .toBeVisible()
      .withTimeout(10000);
  });

  it("skipping it starts the trip with no fuel banner", async () => {
    await openPreview();

    await element(by.id("route-preview-go-btn")).tap();
    await waitFor(element(by.text("ADVISORY ONLY")))
      .toBeVisible()
      .withTimeout(20000);

    // No range given, so nothing to estimate from and nothing to say.
    await expect(element(by.id("fuel-range-warning"))).not.toExist();
  });
});
