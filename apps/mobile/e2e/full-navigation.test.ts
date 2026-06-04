/**
 * E2E Test: Complete Navigation Flow
 *
 * Tests the full 3-tap journey:
 * 1. Bug Out FAB
 * 2. Select destination
 * 3. Confirm route → Navigate
 */

import { by, device, element, expect } from "detox";

describe("Full Navigation Flow", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    // Complete onboarding
    try {
      await element(by.id("onboarding-accept-btn")).tap();
    } catch {
      // Already accepted
    }
  });

  it("shows the map screen with Bug Out FAB", async () => {
    await expect(element(by.id("bug-out-fab"))).toBeVisible();
  });

  it("opens destination picker", async () => {
    await element(by.id("bug-out-fab")).tap();
    await expect(element(by.id("destination-search-input"))).toBeVisible();
  });

  it("searches for an address", async () => {
    await element(by.id("destination-search-input")).typeText("Los Angeles");
    // Wait for debounced search results
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // Should show at least one result
    await expect(element(by.text(/Los Angeles/))).toBeVisible();
  });

  it("selects a destination", async () => {
    await element(by.text(/Los Angeles/)).atIndex(0).tap();
    // Confirm button should be active
    await expect(element(by.id("route-and-go-button"))).toBeVisible();
  });

  it("calculates route and shows preview", async () => {
    await element(by.id("route-and-go-button")).tap();
    // Should navigate to route preview
    await expect(element(by.id("route-preview-go-btn"))).toBeVisible();
    // Should show route stats
    await expect(element(by.text(/Distance/))).toBeVisible();
    await expect(element(by.text(/Duration/))).toBeVisible();
    await expect(element(by.text(/ETA/))).toBeVisible();
  });

  it("starts navigation", async () => {
    await element(by.id("route-preview-go-btn")).tap();
    // Should be on navigation screen
    await expect(element(by.id("stop-navigation-btn"))).toBeVisible();
    await expect(element(by.id("emergency-contact-btn"))).toBeVisible();
  });

  it("stops navigation and returns to map", async () => {
    await element(by.id("stop-navigation-btn")).tap();
    // Should be back on map screen
    await expect(element(by.id("bug-out-fab"))).toBeVisible();
  });
});
