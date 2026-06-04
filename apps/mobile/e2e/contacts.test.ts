/**
 * E2E Test: Emergency Contacts CRUD
 */

import { by, device, element, expect } from "detox";

describe("Emergency Contacts", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    try {
      await element(by.id("onboarding-accept-btn")).tap();
    } catch {
      // Already accepted
    }
  });

  it("navigates to contacts from settings", async () => {
    await element(by.text("Settings")).tap();
    await element(by.id("settings-row-emergency-contacts")).tap();
    await expect(element(by.text("No emergency contacts added"))).toBeVisible();
  });

  it("adds a new contact", async () => {
    await element(by.id("add-contact-btn")).tap();
    await element(by.id("contact-name-input")).typeText("John Doe");
    await element(by.id("contact-phone-input")).typeText("555-0100");
    await element(by.id("save-contact-btn")).tap();
    await expect(element(by.text("John Doe"))).toBeVisible();
    await expect(element(by.text("555-0100"))).toBeVisible();
  });

  it("removes a contact", async () => {
    await element(by.id("remove-contact-")).atIndex(0).tap(); // Dynamic ID
    await element(by.text("Remove")).tap();
    await expect(element(by.text("No emergency contacts added"))).toBeVisible();
  });
});
