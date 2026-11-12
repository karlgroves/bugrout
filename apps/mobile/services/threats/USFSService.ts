/**
 * USFS (US Forest Service) Fire Perimeter Service
 *
 * Fetches active fire perimeters from the NIFC GeoJSON feed.
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

// The NIFC_Perimeters layer this used to query was withdrawn: every request
// to it, query or metadata, answers an ArcGIS 400 "Invalid URL", and the name
// is absent from the org's service list, so the feed fetched nothing at all
// (#336). WFIGS_Interagency_Perimeters_Current is the same org's live
// current-perimeters layer and the supported replacement.
//
// Its schema is WFIGS's, not the old NIFC one: containment is
// `attr_PercentContained`, and the old `irwin_PercentContained` does not
// exist on this layer. Asking for a field the layer does not define is not a
// soft failure: measured against this endpoint, it answers HTTP **200** with
// `{"error":{"code":400,"details":["'outFields' parameter is invalid"]}}` and
// no `features` array at all, so the whole fetch fails rather than returning
// perimeters with one attribute missing. Keep the names requested here and
// the names read in `NIFCResponse` identical; `USFSService.test.ts` pins both.
//
// Keep this one complete literal: `scripts/check-threat-feeds.mjs` reads the
// `NIFC_URL` string out of this file and probes it, so the layer and the
// `outFields` it names have to be the ones the app actually requests.
// `nifcQueryUrl` only adds the region envelope to it (#305).
const NIFC_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?where=1%3D1&outFields=OBJECTID,poly_IncidentName,attr_PercentContained&f=geojson";

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
      attr_PercentContained?: number | null;
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
  const url = new URL(NIFC_URL);
  url.searchParams.set(
    "geometry",
    `${String(bbox.west)},${String(bbox.south)},${String(bbox.east)},${String(bbox.north)}`,
  );
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  return url.toString();
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
          (f.properties.attr_PercentContained ?? 0) < 50
            ? ("severe" as const)
            : ("moderate" as const),
        geometry: f.geometry,
        headline: `Active Fire: ${name}`,
        description: `${f.properties.attr_PercentContained ?? 0}% contained`,
        source: "usfs" as const,
        fetchedAt: Date.now(),
        expiresAt: null,
      };
    },
  );
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
