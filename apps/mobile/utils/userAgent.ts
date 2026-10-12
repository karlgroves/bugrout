/**
 * How BugRout identifies itself to third-party services.
 */

/** Where an operator can reach us; Nominatim and Overpass both ask for it. */
const CONTACT_URL = "https://bugrout.app/support";

/** Subset of the expo-constants module shape read for the app version. */
interface ExpoConstantsModule {
  expoConfig?: { version?: string } | null;
  default?: { expoConfig?: { version?: string } | null };
}

/**
 * The User-Agent sent to the public OpenStreetMap services: the app and its
 * version, plus a contact URL. Nominatim's usage policy requires a UA that
 * identifies the application (#208), and Overpass refuses generic ones: on
 * 2026-10-05 it answered Android's default `okhttp/4.12.0` with 406 and this
 * one with 200.
 *
 * @returns e.g. `"BugRout/1.0.0 (+https://bugrout.app/support)"`.
 */
export function appUserAgent(): string {
  let version = "unknown";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module loaded lazily; mocked on web
    const Constants = require("expo-constants") as ExpoConstantsModule;
    version =
      Constants.default?.expoConfig?.version ??
      Constants.expoConfig?.version ??
      version;
  } catch {
    // Keep "unknown": the contact URL still identifies the app.
  }
  return `BugRout/${version} (+${CONTACT_URL})`;
}
