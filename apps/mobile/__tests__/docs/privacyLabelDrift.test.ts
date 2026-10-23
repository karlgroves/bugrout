/**
 * The store privacy labels have to describe what the build actually sends
 * off-device. Nothing checked them against the code, and they drifted a long
 * way (#206): `apple_privacy.json` declared Coarse Location and Crash Data
 * while listing "Precise Location", "Search History" and "Identifiers" as not
 * collected — and every one of those three was contradicted by the source.
 * `android_data_safety.json` declared `data_shared: []` while destination
 * search posts the query to a third party on the first keystroke. A label that
 * does not match observed traffic is a routine Guideline 5.1.1 / 5.1.2
 * rejection, and a false statement to users besides.
 *
 * So this derives the facts from the source rather than restating them, and
 * fails when a label and the code disagree. Each check names the file and line
 * of code that decides it, because the point is to make the next drift
 * impossible to merge quietly rather than to pin today's wording.
 *
 * It is deliberately bidirectional. PostHog is the reason: no `eas.json`
 * profile sets `EXPO_PUBLIC_POSTHOG_KEY`, so no shipped build initialises
 * analytics, and the labels therefore do *not* declare Usage Data. Setting
 * that key without declaring it fails here, and declaring it without setting
 * it fails here too — over-declaring is a false statement in the other
 * direction, and it is the shape the next change is most likely to take.
 *
 * What it catches, and what it does not, measured rather than assumed:
 *
 *   caught      a declaration removed, or moved to `data_not_collected`,
 *               while the code that produces the data is untouched. All four
 *               of #206's discrepancies are this.
 *
 *   caught      `roundCoord` coarsened or sharpened across Apple's three-
 *               decimal line without the label following, in either
 *               direction.
 *
 *   caught      a new `EXPO_PUBLIC_*` key switched on in `eas.json` for
 *               analytics, or a remote routing URL removed once routing moves
 *               on-device, without the labels following.
 *
 *   not caught  a wholly new third-party request from a file this does not
 *               read. There is no general "what leaves the device" analysis
 *               here; each fact is a named source read on purpose. A new
 *               network call in a new service is invisible to it, and adding
 *               the check is the job of whoever adds the call.
 *
 *   not caught  whether the *hosted* policy at bugrout.app/privacy agrees.
 *               That page is deployed, not in this repository, so #206's
 *               third artifact can only be checked by hand.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- reads this
   repository's own source from fixed roots; no external input reaches these
   paths. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import appConfig from "@/app.config";
import { PRIVACY_POLICY } from "@/constants/legal";

const APP_ROOT = join(__dirname, "..", "..");
const METADATA = join(APP_ROOT, "fastlane", "metadata", "en-US");

/** One declared entry in `apple_privacy.json`. */
interface AppleDataType {
  data_type: string;
}

/** The shape of `apple_privacy.json` this test depends on. */
interface AppleLabel {
  data_types: AppleDataType[];
  data_not_collected: string[];
}

/** One declared entry in `android_data_safety.json`. */
interface AndroidEntry {
  data_type: string;
}

/** The shape of `android_data_safety.json` this test depends on. */
interface AndroidLabel {
  data_shared: AndroidEntry[];
  data_collected: AndroidEntry[];
}

/**
 * Read and parse a JSON file under this app.
 *
 * @param path - Absolute path to the file.
 * @returns The parsed contents, for the caller to narrow.
 */
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Read a source file under this app as text.
 *
 * @param segments - Path segments below `apps/mobile`.
 * @returns The file's contents.
 */
function readSource(...segments: string[]): string {
  return readFileSync(join(APP_ROOT, ...segments), "utf8");
}

const apple = readJson(join(METADATA, "apple_privacy.json")) as AppleLabel;
const android = readJson(
  join(METADATA, "android_data_safety.json"),
) as AndroidLabel;
const easJson = readSource("eas.json");
const crowdSignalSource = readSource("services", "crowd", "CrowdSignal.ts");
const geocoderSource = readSource("services", "geocoding", "Geocoder.ts");

/** The minimum context `app.config.ts` needs to resolve. */
const CONFIG_CONTEXT = {
  projectRoot: APP_ROOT,
  staticConfigPath: null,
  packageJsonPath: null,
  config: {},
};

/**
 * The iOS privacy manifest this repository contributes to the generated
 * `PrivacyInfo.xcprivacy`, resolved from `app.config.ts`.
 *
 * @returns The declared `NSPrivacyCollectedDataType` strings.
 */
function manifestCollectedTypes(): string[] {
  const resolved = appConfig(CONFIG_CONTEXT);
  const types = resolved.ios?.privacyManifests?.NSPrivacyCollectedDataTypes;
  return (types ?? []).map((entry) => entry.NSPrivacyCollectedDataType);
}

/**
 * Apple's `NSPrivacyCollectedDataType` constant for a nutrition-label type.
 * Only the types this app declares are mapped; an unmapped one fails loudly
 * rather than silently counting as satisfied.
 */
const MANIFEST_CONSTANT: Record<string, string> = {
  "Precise Location": "NSPrivacyCollectedDataTypePreciseLocation",
  "Coarse Location": "NSPrivacyCollectedDataTypeCoarseLocation",
  "Search History": "NSPrivacyCollectedDataTypeSearchHistory",
  "Device ID": "NSPrivacyCollectedDataTypeDeviceID",
  "Crash Data": "NSPrivacyCollectedDataTypeCrashData",
};

const appleDeclares = (type: string): boolean =>
  apple.data_types.some((entry) => entry.data_type === type);
const androidCollects = (type: string): boolean =>
  android.data_collected.some((entry) => entry.data_type === type);

/**
 * The number of decimal places `roundCoord` keeps, read from its multiplier.
 *
 * @returns The decimal places, or null when the multiplier cannot be read.
 */
function crowdSignalDecimals(): number | null {
  const match = /Math\.round\(coord \* (\d+)\) \/ \1/.exec(crowdSignalSource);
  if (!match?.[1]) return null;
  return Math.log10(Number(match[1]));
}

describe("crowd-signal coordinate precision vs. the label", () => {
  it("reads the rounding factor out of CrowdSignal", () => {
    expect(crowdSignalDecimals()).not.toBeNull();
  });

  it("declares Precise Location while rounding to 3+ decimals", () => {
    const decimals = crowdSignalDecimals();
    if (decimals === null || decimals < 3) return;
    // Apple counts three or more decimal places as precise, whatever the
    // field is called internally. 4 dp is ~11 m.
    expect(appleDeclares("Precise Location")).toBe(true);
    expect(apple.data_not_collected).not.toContain("Precise Location");
    expect(androidCollects("Precise location")).toBe(true);
  });
});

describe("route endpoints vs. the label", () => {
  const remoteRouting =
    /"EXPO_PUBLIC_VALHALLA_URL":\s*"https?:\/\/(?!localhost)/.test(easJson);

  it("still ships a remote routing URL", () => {
    // When this goes false, routing has moved on-device (#193) and the
    // declarations below are the ones to revisit — not this assertion alone.
    expect(remoteRouting).toBe(true);
  });

  it("declares the location sent to the routing service", () => {
    if (!remoteRouting) return;
    expect(appleDeclares("Precise Location")).toBe(true);
    expect(androidCollects("Precise location")).toBe(true);
  });

  it("does not tell the user routing happens on their device", () => {
    if (!remoteRouting) return;
    expect(PRIVACY_POLICY).not.toMatch(
      /Route calculations[^\n]*on your device/,
    );
    expect(PRIVACY_POLICY).toContain("routing service");
  });
});

describe("destination search vs. the label", () => {
  const usesNominatim = geocoderSource.includes("nominatim.openstreetmap.org");

  it("still posts the query to Nominatim", () => {
    expect(usesNominatim).toBe(true);
  });

  it("declares Search History, and declares it as shared", () => {
    if (!usesNominatim) return;
    expect(appleDeclares("Search History")).toBe(true);
    expect(apple.data_not_collected).not.toContain("Search History");
    expect(androidCollects("Search history")).toBe(true);
    // Nominatim is a third party, so on Play this is sharing, not just
    // collection. `data_shared: []` was the original defect.
    expect(android.data_shared.length).toBeGreaterThan(0);
    expect(
      android.data_shared.some((entry) => entry.data_type === "Search history"),
    ).toBe(true);
  });
});

describe("the crowd-signal device token vs. the label", () => {
  const sendsToken = crowdSignalSource.includes("token: acquired");

  it("still sends a rotating device token", () => {
    expect(sendsToken).toBe(true);
  });

  it("declares a device identifier rather than listing Identifiers as uncollected", () => {
    if (!sendsToken) return;
    expect(appleDeclares("Device ID")).toBe(true);
    expect(apple.data_not_collected).not.toContain("Identifiers");
    expect(apple.data_not_collected).not.toContain("Device ID");
    expect(androidCollects("Device or other IDs")).toBe(true);
  });
});

describe("analytics vs. the label", () => {
  const posthogConfigured = /"EXPO_PUBLIC_POSTHOG_KEY":\s*"\S/.test(easJson);

  it("declares product interaction only when a PostHog key ships", () => {
    // Both directions matter: an undeclared key under-declares, and a
    // declaration with no key over-declares.
    expect(appleDeclares("Product Interaction")).toBe(posthogConfigured);
    expect(androidCollects("App interactions")).toBe(posthogConfigured);
  });
});

describe("the iOS privacy manifest vs. the nutrition label", () => {
  // The generated PrivacyInfo.xcprivacy had NSPrivacyCollectedDataTypes as an
  // empty array, so the manifest declared nothing while the label declared
  // two types and the code sent four. Expo's mergePrivacyInfo appends what
  // app.config.ts contributes, so this is the half the repository owns.
  it("declares every type the nutrition label declares", () => {
    const declared = manifestCollectedTypes();
    expect(declared.length).toBeGreaterThan(0);
    for (const entry of apple.data_types) {
      const constant = MANIFEST_CONSTANT[entry.data_type];
      expect(constant).toBeDefined();
      expect(declared).toContain(constant);
    }
  });

  it("declares nothing the nutrition label leaves out", () => {
    const labelConstants = apple.data_types.map(
      (entry) => MANIFEST_CONSTANT[entry.data_type],
    );
    for (const constant of manifestCollectedTypes()) {
      expect(labelConstants).toContain(constant);
    }
  });

  it("does not claim tracking", () => {
    const resolved = appConfig(CONFIG_CONTEXT);
    expect(resolved.ios?.privacyManifests?.NSPrivacyTracking).toBe(false);
    expect(
      apple.data_types.every((e) => e.data_type !== "Advertising Data"),
    ).toBe(true);
  });
});

describe("crash reporting vs. the code", () => {
  it("describes crash data as the opt-in it is", () => {
    const crash = apple.data_types.find(
      (entry) => entry.data_type === "Crash Data",
    );
    expect(crash).toBeDefined();
    // It used to read "Automatic via Sentry when app crashes", while
    // `initCrashReporting` returns early unless the Settings opt-in is on and
    // a DSN is provisioned — pinned in privacyPolicy.test.ts.
    expect(JSON.stringify(crash)).toMatch(/[Oo]ptional|opt in|opt-in/);
  });
});
