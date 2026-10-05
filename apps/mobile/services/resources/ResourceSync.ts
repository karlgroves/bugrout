/**
 * Resource Data Sync Pipeline
 *
 * Connects resource data sources (NREL, USGS, Shelters) to the resource store.
 * Handles TTL-based refresh and SQLite caching.
 */

import { getResourcesByRegion } from "@/db/queries/resources";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { useResourceStore } from "@/stores/useResourceStore";

import { fetchFuelStations, CACHE_TTL_MS as FUEL_TTL } from "./NRELService";
import { fetchShelters, CACHE_TTL_MS as SHELTER_TTL } from "./ShelterService";
import { fetchWaterSources, CACHE_TTL_MS as WATER_TTL } from "./USGSService";

import type { BBox, ResourceType } from "@bugrout/shared";

/**
 * The state code NREL and USGS expect for a region. Region ids are lowercase
 * postal codes ("md"). This used to be a three-entry table (ca, tx, fl), so
 * for Maryland, the only published region, no resource layer ever fetched.
 *
 * @param regionId - A region id such as "md".
 * @returns "MD", or null for an id that isn't a state code.
 */
function stateCodeFor(regionId: string): string | null {
  return /^[a-z]{2}$/.test(regionId) ? regionId.toUpperCase() : null;
}

const NREL_API_KEY = process.env.EXPO_PUBLIC_NREL_API_KEY ?? "";

/**
 * Refresh all resource data for a region.
 * Only fetches sources past their TTL. Serves cached data when offline.
 */
export async function refreshResources(
  regionId: string,
  bbox: BBox,
): Promise<void> {
  const isOnline = useConnectivityStore.getState().isOnline;
  const store = useResourceStore.getState();

  // Always load cached resources first
  const cached = await getResourcesByRegion(regionId);
  store.setResources(cached);
  const cachedShelterAsOf = newestFetch(cached, "shelter");
  // Offline with nothing cached, there are no shelters to show and none can
  // be fetched: say so rather than leave the layer empty.
  store.setShelterStatus({
    asOf: cachedShelterAsOf,
    failed: !isOnline && cachedShelterAsOf === null,
  });

  if (!isOnline) return;

  const stateCode = stateCodeFor(regionId);
  if (!stateCode) return;

  // Check what needs refreshing based on cached data age
  const fuelAge = getOldestFetchAge(cached, "fuel");
  const waterAge = getOldestFetchAge(cached, "water");
  const shelterAge = getOldestFetchAge(cached, "shelter");

  const fetches: Promise<void>[] = [];

  // An age is Infinity when nothing of that type is cached, so it fetches.
  if (NREL_API_KEY && fuelAge > FUEL_TTL) {
    fetches.push(
      fetchFuelStations(stateCode, NREL_API_KEY, regionId)
        .then((resources) => {
          store.addResources(resources);
        })
        .catch(() => {
          /* noop: best-effort refresh; cached fuel data remains usable offline */
        }),
    );
  }

  if (waterAge > WATER_TTL) {
    fetches.push(
      fetchWaterSources(stateCode, bbox, regionId)
        .then((resources) => {
          store.addResources(resources);
        })
        .catch(() => {
          /* noop: best-effort refresh; cached water data remains usable offline */
        }),
    );
  }

  if (shelterAge > SHELTER_TTL) {
    fetches.push(refreshShelters(bbox, regionId, cachedShelterAsOf));
  }

  await Promise.allSettled(fetches);
}

/**
 * Load only cached resources from SQLite.
 */
export async function loadCachedResources(regionId: string): Promise<void> {
  const cached = await getResourcesByRegion(regionId);
  useResourceStore.getState().setResources(cached);
}

/**
 * Return the age (ms) of the oldest cached resource of a given type, or
 * Infinity when none are cached.
 */
function getOldestFetchAge(
  resources: { type: string; fetchedAt: number }[],
  type: ResourceType,
): number {
  const matching = resources.filter((r) => r.type === type);
  if (matching.length === 0) return Infinity;
  const oldest = Math.min(...matching.map((r) => r.fetchedAt));
  return Date.now() - oldest;
}

/**
 * When the newest cached resource of a type was fetched.
 *
 * @returns Its fetch time, or null when none is cached.
 */
function newestFetch(
  resources: { type: string; fetchedAt: number }[],
  type: ResourceType,
): number | null {
  const times = resources
    .filter((r) => r.type === type)
    .map((r) => r.fetchedAt);
  return times.length === 0 ? null : Math.max(...times);
}

/**
 * Fetch a region's shelters and record how current the layer is.
 *
 * @param cachedAsOf - When the cached shelters were fetched, kept on failure.
 */
async function refreshShelters(
  bbox: BBox,
  regionId: string,
  cachedAsOf: number | null,
): Promise<void> {
  const store = useResourceStore.getState();
  try {
    const shelters = await fetchShelters(bbox, regionId);
    // A fetch replaces the shelters: closed ones must disappear.
    store.setResources([
      ...useResourceStore
        .getState()
        .resources.filter((r) => r.type !== "shelter"),
      ...shelters,
    ]);
    store.setShelterStatus({ asOf: Date.now(), failed: false });
  } catch {
    // Cached shelters stay usable; the map says they couldn't be refreshed
    // rather than presenting them, or nothing, as current.
    store.setShelterStatus({ asOf: cachedAsOf, failed: true });
  }
}
