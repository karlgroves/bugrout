/**
 * Tests for the bundled privacy policy.
 *
 * The policy is a representation the user agrees to at first launch, so the
 * things it claims are as much a contract as any API. These pin the specific
 * claims that were wrong before — and, where the claim depends on code, assert
 * against the code rather than the prose.
 */

import { PRIVACY_POLICY } from "@/constants/legal";
import * as Sentry from "@/platform/sentry";
import { initCrashReporting } from "@/services/CrashReporting";
import { useSettingsStore } from "@/stores/useSettingsStore";

// Hoisted above the imports by babel-plugin-jest-hoist.
jest.mock("@/platform/sentry", () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
}));

describe("privacy policy — third-party disclosure", () => {
  it("names Nominatim as a service that receives the search query", () => {
    expect(PRIVACY_POLICY).toContain("Nominatim");
    expect(PRIVACY_POLICY).toMatch(/Nominatim[\s\S]{0,400}?search/i);
  });

  it("no longer claims no third party receives anything from the user", () => {
    expect(PRIVACY_POLICY).not.toContain(
      "None of these services receive your personal information through BugRout.",
    );
  });

  it("has a bucket for data sent to third parties without an opt-in", () => {
    expect(PRIVACY_POLICY).toContain(
      "Data Transmitted to Third Parties Without an Opt-In",
    );
  });

  it("qualifies the destinations claim rather than stating it flatly", () => {
    // The old text listed "Your route history or destinations" under data never
    // collected, which was true of BugRout's servers and false of the device.
    expect(PRIVACY_POLICY).not.toContain("Your route history or destinations");
    expect(PRIVACY_POLICY).toMatch(
      /destination does leave your device[\s\S]*?Nominatim, not to BugRout/,
    );
  });

  it("names every third-party host the app actually contacts", () => {
    for (const service of [
      "Nominatim",
      "Overpass",
      "National Weather Service",
      "FEMA",
      "USFS",
      "NREL",
      "USGS",
      "Red Cross",
      "Open211",
      "ArcGIS",
      "Sentry",
    ]) {
      expect(PRIVACY_POLICY).toContain(service);
    }
  });

  it("does not assert cryptographic unlinkability of the device token", () => {
    // Pending #85: the token can be minted from Math.random() on some paths,
    // so a flat "cannot be linked" guarantee is not one the code provides.
    expect(PRIVACY_POLICY).not.toContain(
      "Cannot be linked to your identity, device, or account",
    );
  });

  it("has been re-dated", () => {
    expect(PRIVACY_POLICY).not.toContain("Last Updated: April 2026");
    expect(PRIVACY_POLICY).toContain("Last Updated: August 2026");
  });
});

describe("privacy policy — the crash-report consent claim", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ crashReportingOptIn: false });
  });

  it("describes crash reports as conditional on a Settings toggle", () => {
    expect(PRIVACY_POLICY).toMatch(
      /Crash [Rr]eports.*?if you (have )?enabled? (them )?in Settings|If you enable Crash Reports in Settings/,
    );
  });

  it("initialises nothing when the user has not opted in", () => {
    initCrashReporting(useSettingsStore.getState().crashReportingOptIn);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("defaults the opt-in to off", () => {
    expect(useSettingsStore.getInitialState().crashReportingOptIn).toBe(false);
  });

  it("still initialises nothing when opted in but no DSN is provisioned", () => {
    // Today's state: the placeholder DSN means both gates must pass and only
    // one does. The point of the test is that consent is now the first gate.
    initCrashReporting(true);
    expect(Sentry.init).not.toHaveBeenCalled();
  });
});
