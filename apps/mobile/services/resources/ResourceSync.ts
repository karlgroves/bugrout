/**
 * Resource Data Sync Pipeline
 *
 * Connects resource data sources (NREL, USGS, Shelters) to the resource store.
 * Handles TTL-based refresh and SQLite caching.
 */

import type { BBox, ResourceType } from "@bugrout/shared";
import { useResourceStore } from "@/stores/useResourceStore";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { getResourcesByRegion } from "@/db/queries/resources";
import { fetchFuelStations, CACHE_TTL_MS as FUEL_TTL } from "./NRELService";
import { fetchWaterSources, CACHE_TTL_MS as WATER_TTL } from "./USGSService";
import { fetchShelters, CACHE_TTL_MS as SHELTER_TTL } from "./ShelterService";

// State code mapping for NREL/USGS APIs
const REGION_TO_STATE: Record<string, string> = {
  ca: "CA",
  tx: "TX",
  fl: "FL",
};

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

  if (!isOnline) return;

  const stateCode = REGION_TO_STATE[regionId];
  if (!stateCode) return;

  // Check what needs refreshing based on cached data age
  const now = Date.now();
  const fuelAge = getOldestFetchAge(cached, "fuel");
  const waterAge = getOldestFetchAge(cached, "water");
  const shelterAge = getOldestFetchAge(cached, "shelter");

  const fetches: Promise<void>[] = [];

  if (NREL_API_KEY && (fuelAge > FUEL_TTL || cached.filter((r) => r.type === "fuel").length === 0)) {
    fetches.push(
      fetchFuelStations(stateCode, NREL_API_KEY, regionId)
        .then((resources) => store.addResources(resources))
        .catch(() => {}), // Silent fail — cached data still available
    );
  }

  if (waterAge > WATER_TTL || cached.filter((r) => r.type === "water").length === 0) {
    fetches.push(
      fetchWaterSources(stateCode, bbox, regionId)
        .then((resources) => store.addResources(resources))
        .catch(() => {}),
    );
  }

  if (shelterAge > SHELTER_TTL || cached.filter((r) => r.type === "shelter").length === 0) {
    fetches.push(
      fetchShelters(bbox, regionId)
        .then((resources) => store.addResources(resources))
        .catch(() => {}),
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

function getOldestFetchAge(
  resources: { type: string; fetchedAt: number }[],
  type: ResourceType,
): number {
  const matching = resources.filter((r) => r.type === type);
  if (matching.length === 0) return Infinity;
  const oldest = Math.min(...matching.map((r) => r.fetchedAt));
  return Date.now() - oldest;
}
