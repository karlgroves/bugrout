/**
 * Looking up the address a plan is saved by (#187).
 *
 * A plan has to carry coordinates: routing needs them, and it has to work with
 * no signal at bug-out time. So the lookup happens at *save* time, while the
 * user is calm and online, and never when the plan is used.
 *
 * Every way that lookup can end is named here rather than left as a thrown
 * error for a screen to interpret. The two that matter most are the ones that
 * must not quietly succeed: several matches must be offered to the user rather
 * than resolved by taking the first, and no network must save nothing at all
 * rather than a plan with no destination.
 */

import {
  DisclaimerNotAcceptedError,
  SearchSupersededError,
  searchDestinations,
  type GeocodeResult,
} from "@/services/geocoding/Geocoder";

/**
 * What came of looking up an address.
 *
 * - `one` — a single match; save it.
 * - `many` — several matches; the user picks, by full display name.
 * - `none` — the geocoder answered and knows no such place.
 * - `offline` — the request never got an answer. Distinct from `none`: the
 *   address may be perfectly good, so the message must not say it is wrong.
 * - `not-disclosed` — the first-launch disclaimer has not been accepted, so
 *   nothing may be sent yet.
 * - `superseded` — a newer lookup replaced this one; nothing was sent and
 *   nothing should be shown.
 */
export type AddressLookup =
  | { kind: "one"; match: GeocodeResult }
  | { kind: "many"; matches: GeocodeResult[] }
  | { kind: "none" }
  | { kind: "offline" }
  | { kind: "not-disclosed" }
  | { kind: "superseded" };

/**
 * Look up the address typed into the plan editor.
 *
 * @param address - What the user typed. Blank counts as no match.
 * @returns The outcome; never throws for an ordinary failure.
 */
export async function lookupAddress(address: string): Promise<AddressLookup> {
  const query = address.trim();
  if (query === "") return { kind: "none" };

  let results: GeocodeResult[];
  try {
    results = await searchDestinations(query);
  } catch (err) {
    if (err instanceof DisclaimerNotAcceptedError) {
      return { kind: "not-disclosed" };
    }
    if (err instanceof SearchSupersededError) return { kind: "superseded" };
    // A fetch that rejects is a transport failure — no connectivity, DNS, a
    // timeout. The address itself is untouched by that, so it is "offline",
    // not "no such place".
    return { kind: "offline" };
  }

  const [first] = results;
  if (!first) return { kind: "none" };
  if (results.length === 1) return { kind: "one", match: first };
  return { kind: "many", matches: results };
}

/**
 * What to tell the user about an outcome that saved nothing.
 *
 * Kept beside the outcomes so the wording cannot drift from the cases, and so
 * the tests can assert on it.
 *
 * @param lookup - The outcome.
 * @returns A title and body, or `null` when the outcome needs no message.
 */
export function lookupMessage(
  lookup: AddressLookup,
): { title: string; body: string } | null {
  switch (lookup.kind) {
    case "none":
      return {
        title: "Couldn't find that address",
        body: "Check the address, or set this plan by dropping a pin on the map instead.",
      };
    case "offline":
      return {
        title: "You're offline",
        body: "Connect to look up an address, or set this plan by dropping a pin on the map, which needs no connection.",
      };
    case "not-disclosed":
      return {
        title: "Accept the disclaimer first",
        body: "Looking up an address sends it to OpenStreetMap's geocoder. Accept the first-launch disclaimer, or drop a pin on the map instead.",
      };
    case "one":
    case "many":
    case "superseded":
      return null;
  }
}
