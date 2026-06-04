/**
 * Threat Data Sync Pipeline
 *
 * Connects threat data sources (NWS, USFS, FEMA) to the threat store.
 * Handles TTL-based refresh, connectivity-aware fetching, and SQLite persistence.
 * When offline, serves cached data from SQLite.
 */
/* eslint-disable complexity -- pre-existing; tracked in docs/tech-debt.md (refreshThreats: per-source TTL/connectivity branching) */

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
import {
  fetchFirePerimeters,
  CACHE_TTL_MS as USFS_TTL,
} from "./USFSService";

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

  // Fetch all sources in parallel
  const results = await Promise.allSettled(
    sourcesToRefresh.map(async ({ source, fetcher }) => {
      const threats = await fetcher();
      return { source, threats };
    }),
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;

    const { source, threats } = result.value;

    if (threats.length > 0) {
      // Update SQLite cache
      await clearThreatsBySource(source);
      await upsertThreatZones(threats);
    }

    // Update store
    store.addThreats(threats);
    store.setLastFetched(source, now);
  }
}

/**
 * Load only cached threats from SQLite (for initial app load).
 * Does not make any network requests.
 */
export async function loadCachedThreats(): Promise<void> {
  const cached = await getCachedThreats();
  useThreatStore.getState().setThreats(cached);
}

/**
 * Check if any active threats intersect a bounding box.
 * Used to determine if threat overlays should be prominently displayed.
 */
export function hasActiveThreatsInRegion(_bbox: BBox): boolean {
  const threats = useThreatStore.getState().threatZones;
  // Simplified check: any non-expired threat exists
  return threats.some(
    (t) => t.expiresAt === null || t.expiresAt > Date.now(),
  );
}
