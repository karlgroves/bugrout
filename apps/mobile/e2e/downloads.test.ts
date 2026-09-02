/**
 * E2E Test: Offline Maps Downloads
 */

import { by, element, expect } from "detox";

import { launchToMapScreen } from "./support/launch";

describe("Offline Maps", () => {
  beforeAll(async () => {
    await launchToMapScreen();
  });

  it("navigates to downloads from settings", async () => {
    await element(by.text("Settings")).tap();
    await element(by.id("settings-row-offline-maps")).tap();
    await expect(
      element(
        by.text(
          "Download offline maps to navigate without any data connection.",
        ),
      ),
    ).toBeVisible();
  });

  it("shows available regions", async () => {
    await expect(element(by.text("California"))).toBeVisible();
    await expect(element(by.text("Texas"))).toBeVisible();
    await expect(element(by.text("Florida"))).toBeVisible();
  });

  it("shows storage info", async () => {
    await expect(element(by.text(/available/))).toBeVisible();
  });
});
