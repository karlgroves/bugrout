/**
 * USFS (US Forest Service) Fire Perimeter Service
 *
 * Fetches active fire perimeters from NIFC GeoJSON feed.
 * Updated approximately every 12 hours.
 * Cached in SQLite with 12-hour TTL.
 */

import { timeoutSignal } from "@/utils/abort";
import {
  boundedFeatures,
  capText,
  MAX_HEADLINE_CHARS,
  readJsonBounded,
} from "@/utils/feedBounds";
import { withUsableGeometry } from "@/utils/geo";

import type { BBox, ThreatZone } from "@bugrout/shared";

const NIFC_QUERY_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/NIFC_Perimeters/FeatureServer/0/query";

const CACHE_TTL_MS = 43200000; // 12 hours

/** Shape of the NIFC fire-perimeter GeoJSON response (fields may be absent). */
interface NIFCResponse {
  features: {
    /**
     * The layer's OBJECTID, unique per perimeter. ArcGIS sets the GeoJSON
     * feature id only when OBJECTID (or *) is in outFields, so nifcQueryUrl
     * must keep requesting it; without it every feature arrives with no id.
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
 * The NIFC query for the perimeters intersecting `bbox`.
 *
 * Asks only for the region's perimeters, not every active one nationwide
 * (#305), the same envelope query `ShelterService` makes.
 *
 * @param bbox - The region's bounds.
 * @returns The query URL.
 */
export function nifcQueryUrl(bbox: BBox): string {
  const params = new URLSearchParams({
    where: "1=1",
    geometry: `${String(bbox.west)},${String(bbox.south)},${String(bbox.east)},${String(bbox.north)}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OBJECTID,poly_IncidentName,irwin_PercentContained",
    f: "geojson",
  });
  return `${NIFC_QUERY_URL}?${params.toString()}`;
}

/**
 * Fetch the active wildfire perimeters intersecting a region from the NIFC
 * ArcGIS feature service and map them to ThreatZone records.
 *
 * Throws when the feed fails (#288) or the response is larger than the feed
 * bounds allow (#305).
 */
export async function fetchFirePerimeters(bbox: BBox): Promise<ThreatZone[]> {
  const resp = await fetch(nifcQueryUrl(bbox), {
    signal: timeoutSignal(15000),
  });
  // A failed feed must not read as "no active fires" (#288): the caller keeps
  // the cached perimeters, retries on the next sync, and says it failed.
  if (!resp.ok) throw new Error(`NIFC perimeters: HTTP ${resp.status}`);

  const data = await readJsonBounded<NIFCResponse>(resp);

  // Key on the feature, never the incident name: one incident can publish
  // several perimeters and unnamed ones are common, and a shared id makes the
  // later perimeter silently replace the earlier one in the store and SQLite.
  // Unusable perimeters are dropped below so they never reach the cache (#287).
  const seen = new Set<string>();
  const threats = boundedFeatures(data.features, "NIFC perimeters").map(
    (f, i) => {
      const name = capText(
        f.properties.poly_IncidentName ?? "Unnamed",
        MAX_HEADLINE_CHARS,
      );
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
    },
  );
  return withUsableGeometry(threats);
}

export { CACHE_TTL_MS };
