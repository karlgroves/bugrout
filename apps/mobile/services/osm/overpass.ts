/**
 * The public OpenStreetMap Overpass API.
 *
 * It is free and needs no key, but it is shared and often busy: on 2026-10-05
 * a statewide query was refused with "The server is probably too busy to
 * handle your request". So a failure is thrown, never returned as an empty
 * answer — an empty layer must not look like "nothing here". Requests carry
 * the app's identifying User-Agent; Overpass refuses generic ones.
 */

import { timeoutSignal } from "@/utils/abort";
import { appUserAgent } from "@/utils/userAgent";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** One element of an Overpass `out center tags` answer. */
export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  /** Set on nodes. */
  lat?: number;
  lon?: number;
  /** Set on ways and relations by `out center`. */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Run an Overpass QL query.
 *
 * @param query - The query, including its `[out:json]` setting.
 * @param timeoutMs - How long to wait for an answer.
 * @returns The elements of the answer.
 * @throws When Overpass can't be reached, refuses the request, or is too busy.
 */
export async function overpassQuery(
  query: string,
  timeoutMs = 60_000,
): Promise<OverpassElement[]> {
  const resp = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": appUserAgent(),
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: timeoutSignal(timeoutMs),
  });
  if (!resp.ok) throw new Error(`Overpass: HTTP ${String(resp.status)}`);
  // A busy server can answer 200 with an HTML error page instead of JSON.
  let data: { elements?: OverpassElement[]; remark?: string };
  try {
    data = (await resp.json()) as typeof data;
  } catch {
    throw new Error("Overpass: the server is busy (no JSON in its answer)");
  }
  // A query that times out on the server answers with whatever it had (often
  // nothing) and a remark naming the runtime error; that is a failure too.
  if (!data.elements || data.remark?.includes("error")) {
    throw new Error(`Overpass: ${data.remark ?? "no elements in its answer"}`);
  }
  return data.elements;
}

/**
 * Whether an answer's coordinate is usable: a finite number within `limit` of
 * zero. Overpass is open data read straight from JSON, so a field typed here
 * as a number can arrive as `null`, as a string, or out of range, and an
 * unusable coordinate reaches the map and the router as a waypoint (#342).
 *
 * @param value - The raw coordinate from the answer.
 * @param limit - 90 for a latitude, 180 for a longitude.
 * @returns `true` when the coordinate can be used.
 */
function isCoordinate(value: unknown, limit: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= limit
  );
}

/**
 * Where an element is: a node's own position, or a way's centre.
 *
 * @param el - The element from an Overpass answer.
 * @returns Its position, or null when it has none that can be used.
 */
export function elementPosition(
  el: OverpassElement,
): { lat: number; lng: number } | null {
  const lat: unknown = el.lat ?? el.center?.lat;
  const lng: unknown = el.lon ?? el.center?.lon;
  if (!isCoordinate(lat, 90) || !isCoordinate(lng, 180)) return null;
  return { lat, lng };
}
