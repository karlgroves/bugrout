/**
 * Threat Data Sync Pipeline
 *
 * Connects threat data sources (NWS, USFS, FEMA) to the threat store.
 * Handles TTL-based refresh, connectivity-aware fetching, and SQLite persistence.
 * When offline, serves cached data from SQLite.
 */

import {
  upsertThreatZones,
  getCachedThreats,
  clearExpiredThreats,
  clearThreatsBySource,
} from "@/db/queries/threats";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { useThreatStore } from "@/stores/useThreatStore";

import { loadFloodZones } from "./FEMAService";
import { fetchNWSAlerts, CACHE_TTL_MS as NWS_TTL } from "./NWSService";
import { fetchFirePerimeters, CACHE_TTL_MS as USFS_TTL } from "./USFSService";

import type { ThreatZone, ThreatSource, BBox } from "@bugrout/shared";

const SOURCE_TTL: Record<ThreatSource, number> = {
  nws: NWS_TTL,
  usfs: USFS_TTL,
  fema: Infinity, // Static data, never expires
};

/**
 * Refresh all threat data sources.
 * Only fetches sources that are past their TTL.
 * Falls back to cached data when offline.
 */
export async function refreshThreats(
  bbox: BBox,
  regionId: string,
): Promise<void> {
  const isOnline = useConnectivityStore.getState().isOnline;
  const store = useThreatStore.getState();

  // Always clean up expired threats first
  await clearExpiredThreats();

  // Load cached threats from SQLite
  const cached = await getCachedThreats();
  store.setThreats(cached);

  if (!isOnline) return;

  // Check which sources need refreshing
  const now = Date.now();
  const sourcesToRefresh: {
    source: ThreatSource;
    fetcher: () => Promise<ThreatZone[]>;
  }[] = [];

  const nwsLastFetch = store.lastFetched.nws ?? 0;
  if (now - nwsLastFetch > SOURCE_TTL.nws) {
    sourcesToRefresh.push({
      source: "nws",
      fetcher: () => fetchNWSAlerts(bbox),
    });
  }

  const usfsLastFetch = store.lastFetched.usfs ?? 0;
  if (now - usfsLastFetch > SOURCE_TTL.usfs) {
    sourcesToRefresh.push({
      source: "usfs",
      fetcher: fetchFirePerimeters,
    });
  }

  // FEMA flood zones are loaded from local tile package, not fetched
  const femaLastFetch = store.lastFetched.fema ?? 0;
  if (femaLastFetch === 0) {
    sourcesToRefresh.push({
      source: "fema",
      fetcher: () => loadFloodZones(regionId),
    });
  }

  // Fetch all sources in parallel; a rejection stays tied to its source.
  const results = await Promise.all(
    sourcesToRefresh.map(({ source, fetcher }) =>
      fetcher().then(
        (threats) => ({ source, threats }),
        () => ({ source, threats: null }),
      ),
    ),
  );

  for (const { source, threats } of results) {
    await applyResult(source, threats, now);
  }
}

/**
 * Record one source's refresh; `threats` is null when its fetch failed.
 *
 * A failed fetch is not an empty one (#288): it leaves the cached threats in
 * place, marks the source failed so the map and route preview say so, and
 * does NOT advance the source's TTL, so the next sync retries it rather than
 * treating "couldn't reach the feed" as "fetched just now, no threats".
 */
async function applyResult(
  source: ThreatSource,
  threats: ThreatZone[] | null,
  now: number,
): Promise<void> {
  const store = useThreatStore.getState();
  if (threats === null) {
    store.setSourceFailed(source, true);
    return;
  }

  if (threats.length > 0) {
    // The fresh set replaces the source's old one, in SQLite and in the store
    // alike: ids are per feature (#291), so a feed reload can re-key a
    // perimeter, and merging by id alone would show it twice.
    await clearThreatsBySource(source);
    await upsertThreatZones(threats);
    store.setThreats([
      ...useThreatStore
        .getState()
        .threatZones.filter((t) => t.source !== source),
      ...threats,
    ]);
  }
  store.setLastFetched(source, now);
  store.setSourceFailed(source, false);
}

/**
 * Load only cached threats from SQLite (for initial app load).
 * Does not make any network requests.
 */
export async function loadCachedThreats(): Promise<void> {
  const cached = await getCachedThreats();
  useThreatStore.getState().setThreats(cached);
}
