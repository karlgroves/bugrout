/**
 * USFS (US Forest Service) Fire Perimeter Service
 *
 * Fetches active fire perimeters from NIFC GeoJSON feed.
 * Updated approximately every 12 hours.
 * Cached in SQLite with 12-hour TTL.
 */

import { timeoutSignal } from "@/utils/abort";
import { withUsableGeometry } from "@/utils/geo";

import type { ThreatZone } from "@bugrout/shared";

const NIFC_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/NIFC_Perimeters/FeatureServer/0/query?where=1%3D1&outFields=poly_IncidentName,irwin_PercentContained&f=geojson";

const CACHE_TTL_MS = 43200000; // 12 hours

/** Shape of the NIFC fire-perimeter GeoJSON response (fields may be absent). */
interface NIFCResponse {
  features: {
    properties: {
      poly_IncidentName?: string;
      irwin_PercentContained?: number;
    };
    geometry: ThreatZone["geometry"];
  }[];
}

/**
 * Fetch active wildfire perimeters from the NIFC ArcGIS feature service and
 * map them to ThreatZone records.
 */
export async function fetchFirePerimeters(): Promise<ThreatZone[]> {
  const resp = await fetch(NIFC_URL, { signal: timeoutSignal(15000) });
  // A failed feed must not read as "no active fires" (#288): the caller keeps
  // the cached perimeters, retries on the next sync, and says it failed.
  if (!resp.ok) throw new Error(`NIFC perimeters: HTTP ${resp.status}`);

  const data = (await resp.json()) as NIFCResponse;

  // Unusable perimeters are dropped here so they never reach the cache (#287).
  const threats = data.features.map((f) => {
    const name = f.properties.poly_IncidentName ?? "Unnamed";
    return {
      id: `fire-${name}`,
      type: "wildfire" as const,
      severity:
        (f.properties.irwin_PercentContained ?? 0) < 50
          ? ("severe" as const)
          : ("moderate" as const),
      geometry: f.geometry,
      headline: `Active Fire: ${name}`,
      description: `${f.properties.irwin_PercentContained ?? 0}% contained`,
      source: "usfs" as const,
      fetchedAt: Date.now(),
      expiresAt: null,
    };
  });
  return withUsableGeometry(threats);
}

export { CACHE_TTL_MS };
