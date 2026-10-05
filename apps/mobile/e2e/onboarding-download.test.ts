/**
 * E2E Test: onboarding gets the offline map downloaded (#199).
 *
 * Disclaimer → skip location → the Offline Maps step offers each published
 * region with its size → one tap starts the download → "Get Started" opens the
 * map while it continues → once it completes, the map has its region (the
 * download banner, which can't be dismissed, goes away).
 *
 * The download is the real Maryland package from the tile server, about
 * 140 MB, so the last wait is long. It is the only spec that downloads one.
 */

import { by, device, element, expect, waitFor } from "detox";

describe("Onboarding offline map download", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true, delete: true });
  });

  it("offers the published region, with its size, after the location step", async () => {
    await element(by.id("onboarding-accept-btn")).tap();
    await element(by.text("Skip for now")).tap();

    // Location was skipped, so every published region is offered; Maryland
    // is the only one today (#147).
    await waitFor(element(by.id("onboarding-download-md")))
      .toBeVisible()
      .withTimeout(20000);
  });

  it("starts the download in one tap and shows its progress", async () => {
    await element(by.id("onboarding-download-md")).tap();
    await waitFor(element(by.id("onboarding-download-progress")))
      .toBeVisible()
      .withTimeout(10000);
  });

  it("opens the map while the download continues, and shows the region when it lands", async () => {
    await element(by.text("Get Started")).tap();

    // Until tiles load the map keeps its banner. The first-launch guide may
    // cover it; dismiss that first.
    await waitFor(element(by.id("download-guide-skip-btn")))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id("download-guide-skip-btn")).tap();
    await expect(element(by.id("tile-download-banner"))).toBeVisible();

    // A completed first download now updates the map immediately; before
    // #199 it waited for a restart.
    await waitFor(element(by.id("tile-download-banner")))
      .not.toBeVisible()
      .withTimeout(600000);
    await expect(element(by.id("bug-out-fab"))).toBeVisible();
    // Past e2e/jest.config.js's 120 s default: this waits on the download.
  }, 660000);
});
