/**
 * E2E Test: Emergency Contacts CRUD
 */

import { by, element, expect, waitFor } from "detox";

import { fillField } from "./support/input";
import { launchToMapScreen } from "./support/launch";

describe("Emergency Contacts", () => {
  beforeAll(async () => {
    await launchToMapScreen();
  });

  it("navigates to contacts from settings", async () => {
    await element(by.text("Settings")).tap();
    await element(by.id("settings-row-emergency-contacts")).tap();
    await expect(element(by.text("No emergency contacts added"))).toBeVisible();
  });

  it("adds a new contact", async () => {
    await element(by.id("add-contact-btn")).tap();
    // fillField, not typeText: the save button sits at the bottom of the
    // screen, and typing puts the keyboard on top of it. See support/input.ts.
    await fillField(by.id("contact-name-input"), "John Doe");
    await fillField(by.id("contact-phone-input"), "555-0100");
    await element(by.id("save-contact-btn")).tap();

    // waitFor rather than a bare expect: the row appears only after the SQLite
    // write and the re-read that follows it, and Detox's idle resource does not
    // track expo-sqlite's own executor, so it will happily assert first.
    await waitFor(element(by.text("John Doe")))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.text("555-0100"))).toBeVisible();
  });

  it("removes a contact", async () => {
    // Addressed by accessible name, not testID. The remove control's testID is
    // built per row — `remove-contact-${item.id}` — and `by.id` is an exact
    // match, so the bare prefix this spec used to pass could never have
    // matched anything. Two earlier defects hid that: the swallowed try/catch
    // #128 removed, and then the cascade from "adds a new contact" failing
    // first. The label is fixed text plus the contact's name, and the control
    // wraps an icon rather than a Text, so it cannot go ambiguous the way the
    // labels in #114 did.
    await element(by.label("Remove John Doe")).tap();
    await element(by.text("Remove")).tap();
    await waitFor(element(by.text("No emergency contacts added")))
      .toBeVisible()
      .withTimeout(10000);
  });
});
