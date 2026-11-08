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

import type { BBox, ThreatZone } from "@bugrout/shared";

const NIFC_QUERY_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/NIFC_Perimeters/FeatureServer/0/query";

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
    outFields: "poly_IncidentName,irwin_PercentContained",
    f: "geojson",
  });
  return `${NIFC_QUERY_URL}?${params.toString()}`;
}

/**
 * Fetch the active wildfire perimeters intersecting a region from the NIFC
 * ArcGIS feature service and map them to ThreatZone records.
 *
 * Throws when the response is larger than the feed bounds allow (#305).
 */
export async function fetchFirePerimeters(bbox: BBox): Promise<ThreatZone[]> {
  const resp = await fetch(nifcQueryUrl(bbox), {
    signal: timeoutSignal(15000),
  });
  if (!resp.ok) return [];

  const data = await readJsonBounded<NIFCResponse>(resp);

  return boundedFeatures(data.features, "NIFC perimeters").map((f) => {
    const name = capText(
      f.properties.poly_IncidentName ?? "Unnamed",
      MAX_HEADLINE_CHARS,
    );
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
}

export { CACHE_TTL_MS };
