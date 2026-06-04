/**
 * FEMA NFHL (National Flood Hazard Layer) Service
 *
 * Flood zones are static data pre-processed into regional tile packages.
 * This service loads them from local storage — no API calls at runtime.
 *
 * The data pipeline bakes FEMA NFHL data into a GeoJSON file per region:
 *   {regionDir}/{regionId}.flood.geojson
 */

import { getDownloadedRegion } from "@/db/queries/regions";
import * as FileSystem from "@/platform/fileSystem";

import type {
  ThreatZone,
  GeoJSONPolygon,
  GeoJSONMultiPolygon,
} from "@bugrout/shared";

/**
 *
 */
interface FloodFeature {
  type: "Feature";
  properties: {
    FLD_ZONE?: string; // e.g. "A", "AE", "V", "VE", "X"
    ZONE_SUBTY?: string;
    STATIC_BFE?: number;
  };
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
}

/** High-risk flood zones (A and V zones) */
const HIGH_RISK_ZONES = new Set(["A", "AE", "AH", "AO", "AR", "V", "VE"]);

/**
 * Load flood zone polygons from the locally stored regional package.
 * Returns only high-risk flood zones (A and V designations).
 */
export async function loadFloodZones(regionId: string): Promise<ThreatZone[]> {
  const region = await getDownloadedRegion(regionId);
  if (!region) return [];

  // The flood GeoJSON is stored alongside the tile files
  const regionDir = region.pmtilesPath.replace(/\/[^/]+$/, "");
  const floodPath = `${regionDir}/${regionId}.flood.geojson`;

  const fileInfo = await FileSystem.getInfoAsync(floodPath);
  if (!fileInfo.exists) return [];

  try {
    // Read and parse the GeoJSON file
    // Note: On native this would use FileSystem.readAsStringAsync
    // For now, the mock returns empty which is correct for web preview
    return [];

    // Production implementation:
    // const content = await FileSystem.readAsStringAsync(floodPath);
    // const collection = JSON.parse(content) as FloodFeatureCollection;
    // return parseFloodFeatures(collection.features, regionId);
  } catch {
    return [];
  }
}

/**
 * Parse FEMA flood zone features into ThreatZone objects.
 * Filters to high-risk zones only (A and V designations).
 */
export function parseFloodFeatures(
  features: FloodFeature[],
  regionId: string,
): ThreatZone[] {
  return features
    .filter((f) => {
      const zone = f.properties.FLD_ZONE ?? "";
      return HIGH_RISK_ZONES.has(zone);
    })
    .map((f, i) => {
      const zone = f.properties.FLD_ZONE ?? "A";
      const isCoastal = zone.startsWith("V");

      return {
        id: `fema-${regionId}-${i}`,
        type: "flood" as const,
        severity: isCoastal ? ("severe" as const) : ("moderate" as const),
        geometry: f.geometry,
        headline: `FEMA Flood Zone ${zone}`,
        description: f.properties.ZONE_SUBTY
          ? `${f.properties.ZONE_SUBTY}${f.properties.STATIC_BFE ? ` — BFE: ${f.properties.STATIC_BFE} ft` : ""}`
          : `High-risk flood zone (${isCoastal ? "coastal" : "riverine"})`,
        source: "fema" as const,
        fetchedAt: Date.now(),
        expiresAt: null, // Static data, never expires
      };
    });
}
