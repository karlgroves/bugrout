/**
 * Resource Data Sync Pipeline
 *
 * Connects resource data sources (NREL, USGS, Shelters) to the resource store.
 * Handles TTL-based refresh and SQLite caching.
 */

import { getResourcesByRegion } from "@/db/queries/resources";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { useResourceStore } from "@/stores/useResourceStore";

import { fetchOsmFuelStations, CACHE_TTL_MS as FUEL_TTL } from "./FuelService";
import { fetchFuelStations as fetchNrelStations } from "./NRELService";
import { fetchShelters, CACHE_TTL_MS as SHELTER_TTL } from "./ShelterService";
import { fetchWaterSources, CACHE_TTL_MS as WATER_TTL } from "./USGSService";

import type { StatusLayer } from "@/stores/useResourceStore";
import type { BBox, ResourcePoint, ResourceType } from "@bugrout/shared";

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
  // Offline with nothing cached, a layer has nothing to show and nothing can
  // be fetched: say so rather than leave it empty.
  const cachedAsOf = {
    fuel: newestFetch(cached, "fuel"),
    shelter: newestFetch(cached, "shelter"),
  };
  const startStatus = (asOf: number | null) => ({
    asOf,
    failed: !isOnline && asOf === null,
  });
  store.setLayerStatus("fuel", startStatus(cachedAsOf.fuel));
  store.setLayerStatus("shelter", startStatus(cachedAsOf.shelter));

  if (!isOnline) return;

  const stateCode = stateCodeFor(regionId);
  if (!stateCode) return;

  // Check what needs refreshing based on cached data age
  const fuelAge = getOldestFetchAge(cached, "fuel");
  const waterAge = getOldestFetchAge(cached, "water");
  const shelterAge = getOldestFetchAge(cached, "shelter");

  const fetches: Promise<void>[] = [];

  // An age is Infinity when nothing of that type is cached, so it fetches.
  if (fuelAge > FUEL_TTL) {
    // Gasoline and diesel from OSM (#200); NREL adds EV and alternative fuels
    // only when a key is configured, and never stands in for OSM.
    fetches.push(
      refreshLayer(
        "fuel",
        cachedAsOf.fuel,
        () => fetchOsmFuelStations(bbox, regionId),
        (r) => r.type === "fuel" && r.source === "osm",
      ),
    );
    if (NREL_API_KEY) {
      fetches.push(
        fetchNrelStations(stateCode, NREL_API_KEY, regionId)
          .then((resources) => {
            store.addResources(resources);
          })
          .catch(() => {
            /* noop: an optional supplement; the OSM stations are the layer */
          }),
      );
    }
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
    fetches.push(
      refreshLayer(
        "shelter",
        cachedAsOf.shelter,
        () => fetchShelters(bbox, regionId),
        (r) => r.type === "shelter",
      ),
    );
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
 * Fetch a layer and record how current it is. A fetch replaces the points it
 * owns — a shelter that closed, a station that shut, must disappear.
 *
 * @param cachedAsOf - When the cached points were fetched, kept on failure.
 * @param owns - Which points in the store this fetch replaces.
 */
async function refreshLayer(
  layer: StatusLayer,
  cachedAsOf: number | null,
  fetchLayer: () => Promise<ResourcePoint[]>,
  owns: (r: ResourcePoint) => boolean,
): Promise<void> {
  const store = useResourceStore.getState();
  try {
    const points = await fetchLayer();
    store.setResources([
      ...useResourceStore.getState().resources.filter((r) => !owns(r)),
      ...points,
    ]);
    store.setLayerStatus(layer, { asOf: Date.now(), failed: false });
  } catch {
    // Cached points stay usable; the map says they couldn't be refreshed
    // rather than presenting them, or nothing, as current.
    store.setLayerStatus(layer, { asOf: cachedAsOf, failed: true });
  }
}
