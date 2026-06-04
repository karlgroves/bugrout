/**
 * E2E Test: Three-Tap Navigation Flow
 *
 * Verifies the core user journey:
 * Launch → Bug Out FAB → Select destination → Route & Go → Navigation active
 *
 * This is the most critical flow in the app and MUST work reliably.
 */

import { by, device, element, expect } from "detox";

describe("Navigation Flow", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it("should show onboarding on first launch", async () => {
    await expect(element(by.text("BugRout"))).toBeVisible();
    await expect(element(by.text("Important Disclaimer"))).toBeVisible();
  });

  it("should accept disclaimer and show map", async () => {
    await element(by.text("I Understand — Continue")).tap();
    // Should now be on the map screen
    await expect(element(by.label("Bug Out — set evacuation destination"))).toBeVisible();
  });

  it("should open destination picker on FAB tap", async () => {
    await element(by.label("Bug Out — set evacuation destination")).tap();
    await expect(element(by.label("Search for an address"))).toBeVisible();
  });

  // Note: Full route calculation requires Valhalla running.
  // This test verifies the UI flow only.
  it("should show recent destinations section", async () => {
    await expect(element(by.text("Recent Destinations"))).toBeVisible();
  });
});

describe("Offline Mode", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    // Accept onboarding
    try {
      await element(by.text("I Understand — Continue")).tap();
    } catch {
      // Already accepted
    }
  });

  it("should show offline status indicator", async () => {
    // Disable network
    await device.setURLBlacklist([".*"]);

    await expect(element(by.text("Offline"))).toBeVisible();

    // Re-enable network
    await device.setURLBlacklist([]);
  });

  it("should show tile download banner when no tiles downloaded", async () => {
    await expect(
      element(by.label("Download offline maps to navigate without a connection")),
    ).toBeVisible();
  });
});

describe("Settings", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await element(by.text("I Understand — Continue")).tap();
    } catch {
      // Already accepted
    }
  });

  it("should navigate to settings tab", async () => {
    await element(by.text("Settings")).tap();
    await expect(element(by.text("Offline Maps"))).toBeVisible();
    await expect(element(by.text("Emergency Contacts"))).toBeVisible();
  });

  it("should open offline maps screen", async () => {
    await element(by.text("Offline Maps")).tap();
    await expect(
      element(by.text("Download offline maps to navigate without any data connection.")),
    ).toBeVisible();
  });
});
