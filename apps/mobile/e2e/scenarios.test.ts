/**
 * E2E Test: Scenario Management
 *
 * Tests creating, editing, and activating evacuation scenarios.
 */

import { by, device, element, expect } from "detox";

describe("Scenario Management", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await element(by.text("I Understand — Continue")).tap();
    } catch {
      // Already accepted
    }
  });

  it("should navigate to scenarios tab", async () => {
    await element(by.text("Scenarios")).tap();
    await expect(element(by.text("No Scenarios Saved"))).toBeVisible();
  });

  it("should open scenario editor", async () => {
    await element(by.text("Create Scenario")).tap();
    await expect(element(by.label("Scenario name"))).toBeVisible();
  });

  it("should create a new scenario", async () => {
    await element(by.label("Scenario name")).typeText("Wildfire East");
    await element(by.label("Destination latitude")).typeText("34.0522");
    await element(by.label("Destination longitude")).typeText("-118.2437");
    await element(by.text("Save Scenario")).tap();

    // Should return to scenarios list
    await expect(element(by.text("Wildfire East"))).toBeVisible();
  });

  it("should show scenario in destination picker", async () => {
    await element(by.text("Map")).tap();
    await element(by.label("Bug Out — set evacuation destination")).tap();
    await expect(element(by.text("Wildfire East"))).toBeVisible();
  });
});
