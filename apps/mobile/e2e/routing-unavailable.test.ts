/**
 * E2E Test: a destination outside the road data gets an honest "no route"
 * (#190).
 *
 * Baltimore → Louisville used to produce a 14h 50m route with turn-by-turn
 * directions that the app made up: the routing engine only has Maryland, said
 * so with error 171, and a fallback turned that into a straight line presented
 * as a real route. This walks the same request through the UI and asserts the
 * user is told the truth instead.
 *
 * The Valhalla replay server (support/valhalla-replay-server.js) answers any
 * unrecorded route with the live server's own error 171, so no special setup
 * is needed beyond routing somewhere unrecorded.
 */

import { by, device, element, expect, waitFor } from "detox";

import { launchToMapScreen } from "./support/launch";
import { createScenario } from "./support/scenario";

const SCENARIO_NAME = "Out of State";

describe("Routing outside the road data", () => {
  beforeAll(async () => {
    await launchToMapScreen();
    await device.setLocation(39.2904, -76.6122); // Baltimore
  });

  it("explains that the destination is outside the offline maps", async () => {
    await createScenario(SCENARIO_NAME, 38.2542, -85.7594); // Louisville, KY

    await element(by.id("bug-out-fab")).tap();
    await waitFor(element(by.label(`Use scenario: ${SCENARIO_NAME}`)))
      .toBeVisible()
      .withTimeout(10000);
    // Choosing the scenario routes to it (#197).
    await element(by.label(`Use scenario: ${SCENARIO_NAME}`)).tap();

    await waitFor(element(by.id("route-unavailable")))
      .toBeVisible()
      .withTimeout(30000);
    await expect(element(by.text("Outside your offline maps"))).toBeVisible();
    await expect(element(by.id("route-unavailable-downloads"))).toBeVisible();
    // No route was invented: the picker is still showing, with no preview.
    await expect(element(by.id("route-preview-go-btn"))).not.toExist();
  });
});
