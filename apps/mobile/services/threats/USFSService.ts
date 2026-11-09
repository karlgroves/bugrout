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
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/NIFC_Perimeters/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID,poly_IncidentName,irwin_PercentContained&f=geojson";

const CACHE_TTL_MS = 43200000; // 12 hours

/** Shape of the NIFC fire-perimeter GeoJSON response (fields may be absent). */
interface NIFCResponse {
  features: {
    /**
     * The layer's OBJECTID, unique per perimeter. ArcGIS sets the GeoJSON
     * feature id only when OBJECTID (or *) is in outFields, so NIFC_URL must
     * keep requesting it; without it every feature arrives with no id.
     */
    id?: string | number | null;
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

  // Key on the feature, never the incident name: one incident can publish
  // several perimeters and unnamed ones are common, and a shared id makes the
  // later perimeter silently replace the earlier one in the store and SQLite.
  // Unusable perimeters are dropped below so they never reach the cache (#287).
  const seen = new Set<string>();
  const threats = data.features.map((f, i) => {
    const name = f.properties.poly_IncidentName ?? "Unnamed";
    let id =
      f.id === undefined || f.id === null
        ? `fire-i${String(i)}`
        : `fire-${String(f.id)}`;
    if (seen.has(id)) id = `${id}-${String(i)}`;
    seen.add(id);
    return {
      id,
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
  const usable = withUsableGeometry(threats);
  // Every NIFC feature is a perimeter polygon, so a response that carried
  // features but left nothing usable is a broken feed, not "no active fires"
  // (#338). Resolving to [] here would stamp the source as fetched just now,
  // suppress the "couldn't update" notice (#288) and drop the cached
  // perimeters, so the driver would silently lose the fire data.
  if (usable.length === 0 && data.features.length > 0) {
    throw new Error(
      `NIFC perimeters: all ${String(data.features.length)} features have unusable geometry`,
    );
  }
  return usable;
}

export { CACHE_TTL_MS };
