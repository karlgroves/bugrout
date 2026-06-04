/**
 * Shelter Service
 *
 * Aggregates shelter data from Red Cross and 211.org Open211 API.
 * Online-only data sources — cache aggressively in SQLite.
 *
 * Red Cross: https://www.redcross.org/get-help/disaster-relief-and-recovery-services/find-an-open-shelter.html
 * Open211: https://openreferral.org/
 */

import { upsertResourcePoints } from "@/db/queries/resources";

import type { ResourcePoint, BBox } from "@bugrout/shared";

const CACHE_TTL_MS = 3600000; // 1 hour (shelters change during events)

/**
 * Fetch shelter locations from available APIs.
 * Falls back gracefully if APIs are unavailable.
 */
export async function fetchShelters(
  bbox: BBox,
  regionId: string,
): Promise<ResourcePoint[]> {
  const results = await Promise.allSettled([
    fetchRedCrossShelters(bbox, regionId),
    fetchOpen211Shelters(bbox, regionId),
  ]);

  const resources: ResourcePoint[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      resources.push(...result.value);
    }
  }

  if (resources.length > 0) {
    await upsertResourcePoints(resources);
  }

  return resources;
}

/**
 * Fetch Red Cross open shelter locations.
 *
 * Note: Red Cross doesn't have a stable public API for shelters.
 * In production, this would use the ARC data feed or a partnership API.
 * For MVP, we use their public JSON endpoint (may change).
 */
async function fetchRedCrossShelters(
  bbox: BBox,
  regionId: string,
): Promise<ResourcePoint[]> {
  // Red Cross shelters are event-driven — only available during active disasters.
  // The public endpoint is:
  // https://www.redcross.org/content/dam/redcross/get-help/find-open-shelter/shelter-data.json
  // This may require a scraping approach or a partnership for stable access.

  try {
    const resp = await fetch(
      "https://www.redcross.org/content/dam/redcross/get-help/find-open-shelter/shelter-data.json",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) },
    );

    if (!resp.ok) return [];

    const data = (await resp.json()) as {
      SHELTER_NAME?: string;
      ADDRESS?: string;
      CITY?: string;
      STATE?: string;
      LATITUDE?: number;
      LONGITUDE?: number;
      SHELTER_STATUS?: string;
    }[];

    return data.flatMap((s) => {
      const lat = s.LATITUDE;
      const lng = s.LONGITUDE;
      if (
        lat === undefined ||
        lng === undefined ||
        lat < bbox.south ||
        lat > bbox.north ||
        lng < bbox.west ||
        lng > bbox.east ||
        s.SHELTER_STATUS !== "OPEN"
      ) {
        return [];
      }
      return [
        {
          id: `redcross-${s.SHELTER_NAME}-${lat}`,
          type: "shelter" as const,
          name: s.SHELTER_NAME ?? "Red Cross Shelter",
          lat,
          lng,
          address: [s.ADDRESS, s.CITY, s.STATE].filter(Boolean).join(", "),
          metadata: {
            status: s.SHELTER_STATUS,
            organization: "Red Cross",
          },
          source: "redcross" as const,
          fetchedAt: Date.now(),
          regionId,
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * Fetch shelter/service locations from 211.org Open211 API.
 *
 * Open211 implements the Human Services Data API (HSDA) standard.
 * Note: Many 211 providers require API keys or have region-specific endpoints.
 * This is a best-effort integration.
 */
function fetchOpen211Shelters(
  _bbox: BBox,
  _regionId: string,
): Promise<ResourcePoint[]> {
  // Open211 doesn't have a single national endpoint — each state/region
  // has its own provider. For MVP, we'll use the taxonomy search approach.
  // Taxonomy code for emergency shelter: BH-1800 (AIRS taxonomy)
  //
  // A production implementation would maintain a registry of regional
  // Open211 endpoints and query the appropriate one.

  // Placeholder: return empty until we identify specific regional endpoints
  return Promise.resolve([]);
}

export { CACHE_TTL_MS };
