/**
 * How old each threat source's cached data is (#340).
 *
 * The time of a source's last successful fetch used to live only in memory,
 * so after a restart nothing knew whether the cached threats were an hour old
 * or a month old, and an offline route preview showed a route checked against
 * either with no notice. #288 left a staleness warning out for that reason:
 * with no time surviving a restart it would have fired on every offline
 * launch. The time is now written to SQLite on every successful fetch, so the
 * warning can be about the data's real age.
 *
 * It is kept in the `preferences` key/value table rather than read back from
 * `threat_zones.fetched_at`, because a successful fetch with nothing active
 * leaves no rows (#338) and would otherwise look like "never fetched".
 */

import { getPreference, setPreference } from "@/db/queries/preferences";
import { useThreatStore } from "@/stores/useThreatStore";

import { CACHE_TTL_MS as NWS_TTL } from "./NWSService";
import { CACHE_TTL_MS as USFS_TTL } from "./USFSService";

import type { ThreatSource, ThreatZone } from "@bugrout/shared";

export /** How often each source is refetched; older data than this is stale. */
const SOURCE_TTL: Record<ThreatSource, number> = {
  nws: NWS_TTL,
  usfs: USFS_TTL,
  fema: Infinity, // Static data, never expires
};

const SOURCES: ThreatSource[] = ["nws", "usfs", "fema"];

/** The preference key holding a source's last successful fetch time. */
function fetchTimeKey(source: ThreatSource): string {
  return `threat_fetched_at_${source}`;
}

/**
 * Record a source's successful fetch, in the store and in SQLite.
 *
 * A failed write is logged and swallowed: the fetch it describes has already
 * been applied, and losing the time costs only the staleness notice.
 */
export async function recordThreatFetch(
  source: ThreatSource,
  at: number,
): Promise<void> {
  useThreatStore.getState().setDataAsOf(source, at);
  try {
    await setPreference(fetchTimeKey(source), String(at));
  } catch (err) {
    console.warn("[BugRout] Couldn't save threat fetch time:", err);
  }
}

/**
 * Load each source's last successful fetch time into the store.
 *
 * A source with no saved time — an install that last fetched before the time
 * was saved — falls back to the newest `fetchedAt` among its cached threats.
 * A source with neither stays unset: it has never been fetched, which is not
 * the same as stale, and nothing is said about it.
 *
 * A time already in the store is never moved backwards.
 *
 * @param cached - The cached threats just read from SQLite.
 */
export async function loadThreatFetchTimes(
  cached: ThreatZone[],
): Promise<void> {
  for (const source of SOURCES) {
    const at =
      (await savedFetchTime(source)) ??
      newestFetch(cached.filter((t) => t.source === source));
    // Only ever forwards: a fetch applied while these reads were in flight
    // has already set a newer time, and an older one must not replace it.
    const known = useThreatStore.getState().dataAsOf[source] ?? 0;
    if (at !== null && at > known) {
      useThreatStore.getState().setDataAsOf(source, at);
    }
  }
}

/** A source's saved fetch time, or null when none is readable. */
async function savedFetchTime(source: ThreatSource): Promise<number | null> {
  try {
    const saved = await getPreference(fetchTimeKey(source));
    const at = saved === null ? NaN : Number(saved);
    return Number.isFinite(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

/** The newest `fetchedAt` among some threats, or null when there are none. */
function newestFetch(threats: ThreatZone[]): number | null {
  const times = threats.map((t) => t.fetchedAt).filter((at) => at > 0);
  return times.length > 0 ? Math.max(...times) : null;
}

/** A source whose cached data is older than its refresh interval. */
interface StaleSource {
  source: ThreatSource;
  /** How long ago it was last fetched successfully. */
  ageMs: number;
}

/**
 * The sources whose cached data is older than their refresh interval.
 *
 * Leaves out a source that has never been fetched (nothing cached to be
 * stale) and one whose last refresh failed (the failure notice already covers
 * it, #288).
 */
export function staleSources(
  dataAsOf: Partial<Record<ThreatSource, number>>,
  failedSources: Partial<Record<ThreatSource, boolean>>,
  now: number,
): StaleSource[] {
  return SOURCES.flatMap((source) => {
    const at = dataAsOf[source];
    if (at === undefined || failedSources[source]) return [];
    const ageMs = now - at;
    return ageMs > SOURCE_TTL[source] ? [{ source, ageMs }] : [];
  });
}
