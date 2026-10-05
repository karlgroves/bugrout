/**
 * Destination geocoding via Nominatim.
 *
 * This is the only place in BugRout where a user-typed string leaves the
 * device. Nominatim (operated by the OpenStreetMap Foundation) receives the
 * search query and, unavoidably, the requesting IP address. In an evacuation
 * app, where a person is trying to go is plausibly the most sensitive thing the
 * app handles, so the call is centralized here rather than inlined in a screen
 * — one place to gate, one place to audit, one place to disclose.
 *
 * The bundled privacy policy (`constants/legal.ts`, section 4) names this
 * service and what it receives. Policy and code have to be changed together.
 */

import { getPreference } from "@/db/queries/preferences";
import { timeoutSignal } from "@/utils/abort";

/** Nominatim search endpoint. US results only, capped at 8. */
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

/** Abort a geocoding request that has not answered in this many ms. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Minimum gap between two requests from this device. The OSM Foundation's
 * Nominatim usage policy allows at most one request per second (#208); the
 * picker's 400 ms debounce alone doesn't hold a steady typist to that.
 */
const MIN_REQUEST_INTERVAL_MS = 1_000;

/** Where the operator can reach us, as the usage policy requires. */
const CONTACT_URL = "https://bugrout.app/support";

/** Subset of the expo-constants module shape read for the app version. */
interface ExpoConstantsModule {
  expoConfig?: { version?: string } | null;
  default?: { expoConfig?: { version?: string } | null };
}

/**
 * The User-Agent sent to Nominatim: the app and its version, plus a contact
 * URL. The usage policy requires a UA that identifies the application; a
 * generic one gets an app blocked, and it can be blocked without notice.
 *
 * @returns e.g. `"BugRout/1.0.0 (+https://bugrout.app/support)"`.
 */
export function nominatimUserAgent(): string {
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

/**
 * Thrown when a search is overtaken by a newer one while waiting for its turn
 * under {@link MIN_REQUEST_INTERVAL_MS}. Nothing was sent; the newer search
 * will answer instead.
 */
export class SearchSupersededError extends Error {
  constructor() {
    super("A newer search replaced this one before it was sent");
    this.name = "SearchSupersededError";
  }
}

let lastRequestAt = Number.NEGATIVE_INFINITY;
let latestTicket = 0;

/**
 * Wait until a request may be sent under the rate limit. Only the newest
 * waiting search goes; older ones are dropped, so a burst of typing costs one
 * request rather than a queue of them.
 *
 * @throws {SearchSupersededError} When a newer search arrived while waiting.
 */
async function takeRequestSlot(): Promise<void> {
  const ticket = ++latestTicket;
  const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  if (ticket !== latestTicket) throw new SearchSupersededError();
  lastRequestAt = Date.now();
}

/** A single geocoding result, already reduced to what the picker renders. */
export interface GeocodeResult {
  /** Full Nominatim display name. */
  displayName: string;
  /** Shortened "road, city, state" label for the list row. */
  shortName: string;
  /** Result latitude. */
  lat: number;
  /** Result longitude. */
  lng: number;
}

/**
 * Raw Nominatim address sub-object; every field is optional.
 */
interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  road?: string;
  house_number?: string;
}

/**
 * Raw Nominatim search result.
 */
interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

/**
 * Thrown when geocoding is attempted before the first-launch disclaimer has
 * been accepted.
 *
 * The disclaimer is where the user is shown the privacy policy that discloses
 * this request. Sending the query first would mean disclosing a transmission
 * that had already happened.
 */
export class DisclaimerNotAcceptedError extends Error {
  constructor() {
    super("Geocoding attempted before the disclaimer was accepted");
    this.name = "DisclaimerNotAcceptedError";
  }
}

/**
 * Whether the user has accepted the first-launch disclaimer.
 *
 * @returns True when the stored preference records acceptance.
 */
async function hasAcceptedDisclaimer(): Promise<boolean> {
  return (await getPreference("disclaimer_accepted")) === "true";
}

/**
 * Reduce a Nominatim address to a short, human-readable label.
 *
 * @param address - The address sub-object, when present.
 * @param fallback - The full display name to fall back to.
 * @returns A short label such as `"120 Main St, Oakland, CA"`.
 */
export function buildShortName(
  address: NominatimAddress | undefined,
  fallback: string,
): string {
  const firstSegment = fallback.split(",")[0] ?? fallback;
  if (!address) return firstSegment;

  const parts = [
    streetOf(address),
    address.city ?? address.town ?? address.village,
    address.state,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : firstSegment;
}

/**
 * The street portion of a Nominatim address, if it has one.
 *
 * @param address - The address sub-object.
 * @returns `"120 Main St"`, `"Main St"`, or undefined.
 */
function streetOf(address: NominatimAddress): string | undefined {
  if (address.house_number && address.road) {
    return `${address.house_number} ${address.road}`;
  }
  return address.road;
}

/**
 * Search Nominatim for destinations matching a typed query.
 *
 * Refuses to transmit anything until the disclaimer has been accepted. The
 * screen redirect in `app/_layout.tsx` already keeps a first-launch user away
 * from the destination picker; this is the guarantee that does not depend on
 * navigation state being correct, and it is the one a test can pin.
 *
 * @param query - The user's typed search string.
 * @returns Matching destinations, or an empty array when the request fails.
 * @throws {DisclaimerNotAcceptedError} When the disclaimer has not been accepted.
 * @throws {SearchSupersededError} When a newer search replaced this one before
 *   it was sent (requests are held to one per second).
 */
export async function searchDestinations(
  query: string,
): Promise<GeocodeResult[]> {
  if (!(await hasAcceptedDisclaimer())) {
    throw new DisclaimerNotAcceptedError();
  }

  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "8",
    countrycodes: "us",
    addressdetails: "1",
  });

  await takeRequestSlot();

  const resp = await fetch(`${NOMINATIM_SEARCH}?${params.toString()}`, {
    headers: { "User-Agent": nominatimUserAgent() },
    signal: timeoutSignal(REQUEST_TIMEOUT_MS),
  });
  if (!resp.ok) return [];

  const data = (await resp.json()) as NominatimResult[];
  return data.map((d) => ({
    displayName: d.display_name,
    shortName: buildShortName(d.address, d.display_name),
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}
