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
      /destination does leave your device[\s\S]*?routing service[\s\S]*?Nominatim/,
    );
  });

  it("does not claim the destination goes to Nominatim and not to us (#206)", () => {
    // It goes to both: Nominatim as search text, and BugRout's own routing
    // service as a coordinate pair. The old wording named only the first and
    // explicitly ruled out the second.
    expect(PRIVACY_POLICY).not.toContain("Nominatim, not to BugRout");
    expect(PRIVACY_POLICY).not.toContain(
      "no route you plan is ever sent to us",
    );
  });

  it("does not claim route calculation happens on the device (#206)", () => {
    // Every eas.json profile sets EXPO_PUBLIC_VALHALLA_URL, so routing is a
    // request to a server. The policy listed it under "Processed On-Device
    // Only" and promised the GPS position never left except for Crowd Signal.
    expect(PRIVACY_POLICY).not.toContain(
      "Route calculations (performed entirely on your device",
    );
    expect(PRIVACY_POLICY).not.toContain(
      "never sent to our servers unless you opt in to Crowd Signal",
    );
  });

  it("discloses the route request as data transmitted to us (#206)", () => {
    expect(PRIVACY_POLICY).toMatch(
      /Route requests\. Every time you ask for a route, your starting point and your destination are sent to BugRout's routing service/,
    );
    // The heading used to promise everything in the section was opt-in.
    expect(PRIVACY_POLICY).not.toContain(
      "b) Data Transmitted to Us (Only When Online and Opted In)",
    );
  });

  it("no longer lists precise location as never collected (#206)", () => {
    expect(PRIVACY_POLICY).not.toContain(
      "Your precise location (only rounded coordinates",
    );
  });

  it("promises no retention property the code does not establish (#206)", () => {
    // Caught reviewing the first pass of this change, which replaced the old
    // false claim with a new unverifiable one. backend/services/valhalla's
    // Dockerfile runs valhalla_build_config with only --mjolnir-* and
    // --service-limits-* flags, so Valhalla's default top-level logging block
    // applies — {"type": "std_out"} — and fly.toml configures no logging, so
    // request logging goes to stdout and Fly retains it. "Keeps no history of
    // the routes it has calculated" was a promise nothing here backs.
    expect(PRIVACY_POLICY).not.toMatch(/keeps no history of the routes/);
    expect(PRIVACY_POLICY).not.toMatch(/we store no destination and no route/);
    expect(PRIVACY_POLICY).toContain("operational logs");
    // What is defensible is the absence of a store, which is checkable: no
    // service in this repository receives or persists a route.
    expect(PRIVACY_POLICY).toContain("keeps no database of your routes");
  });

  it("names Fly.io as the host of the routing service (#206)", () => {
    expect(PRIVACY_POLICY).toContain("Fly.io");
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
      "ESF6-SS",
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

  it("says shelter lookups send the region's bounding box (#201)", () => {
    expect(PRIVACY_POLICY).toContain(
      "Shelters. BugRout sends the bounding box of your downloaded map region",
    );
    expect(PRIVACY_POLICY).not.toMatch(/water gauges and shelters/);
  });

  it("has been re-dated", () => {
    // October 2026: shelters moved from Red Cross/Open211 to FEMA ESF6-SS (#201).
    expect(PRIVACY_POLICY).not.toContain("Last Updated: August 2026");
    expect(PRIVACY_POLICY).toContain("Last Updated: October 2026");
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
