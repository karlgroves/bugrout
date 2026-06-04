/**
 * USFS (US Forest Service) Fire Perimeter Service
 *
 * Fetches active fire perimeters from NIFC GeoJSON feed.
 * Updated approximately every 12 hours.
 * Cached in SQLite with 12-hour TTL.
 */

import type { ThreatZone } from "@bugrout/shared";

const NIFC_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/NIFC_Perimeters/FeatureServer/0/query?where=1%3D1&outFields=poly_IncidentName,irwin_PercentContained&f=geojson";

const CACHE_TTL_MS = 43200000; // 12 hours

export async function fetchFirePerimeters(): Promise<ThreatZone[]> {
  const resp = await fetch(NIFC_URL, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) return [];

  const data = (await resp.json()) as {
    features: Array<{
      properties: {
        poly_IncidentName: string;
        irwin_PercentContained: number;
      };
      geometry: ThreatZone["geometry"];
    }>;
  };

  return data.features.map((f) => ({
    id: `fire-${f.properties.poly_IncidentName}`,
    type: "wildfire" as const,
    severity:
      (f.properties.irwin_PercentContained ?? 0) < 50
        ? ("severe" as const)
        : ("moderate" as const),
    geometry: f.geometry,
    headline: `Active Fire: ${f.properties.poly_IncidentName}`,
    description: `${f.properties.irwin_PercentContained ?? 0}% contained`,
    source: "usfs" as const,
    fetchedAt: Date.now(),
    expiresAt: null,
  }));
}

export { CACHE_TTL_MS };
