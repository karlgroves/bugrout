/**
 * USGS NWIS (National Water Information System) Service
 *
 * Fetches water source locations: stream gauges, springs.
 * Supplemented with OSM Overpass data for drinking water, wells.
 *
 * USGS API: https://waterservices.usgs.gov/
 * Overpass API: https://overpass-api.de/
 */
/* eslint-disable complexity, sonarjs/cognitive-complexity -- pre-existing; tracked in docs/tech-debt.md (parseUSGSRdb: tab-delimited RDB parser with header/column detection) */

import { upsertResourcePoints } from "@/db/queries/resources";

import type { ResourcePoint, BBox } from "@bugrout/shared";

const USGS_BASE = "https://waterservices.usgs.gov/nwis/site/";
const OVERPASS_BASE = "https://overpass-api.de/api/interpreter";
const CACHE_TTL_MS = 86400000; // 24 hours

/**
 * Fetch water sources from both USGS and OSM for a region.
 */
export async function fetchWaterSources(
  stateCode: string,
  bbox: BBox,
  regionId: string,
): Promise<ResourcePoint[]> {
  const [usgsSites, osmSources] = await Promise.allSettled([
    fetchUSGSSites(stateCode, regionId),
    fetchOSMWaterSources(bbox, regionId),
  ]);

  const resources: ResourcePoint[] = [];

  if (usgsSites.status === "fulfilled") {
    resources.push(...usgsSites.value);
  }
  if (osmSources.status === "fulfilled") {
    resources.push(...osmSources.value);
  }

  // Cache in SQLite
  if (resources.length > 0) {
    await upsertResourcePoints(resources);
  }

  return resources;
}

/**
 * Fetch USGS stream gauge and spring sites.
 * Uses the USGS NWIS site service with RDB (tab-delimited) output.
 */
async function fetchUSGSSites(
  stateCode: string,
  regionId: string,
): Promise<ResourcePoint[]> {
  const params = new URLSearchParams({
    format: "rdb",
    stateCd: stateCode,
    siteType: "ST,SP", // Streams and springs
    siteStatus: "active",
    hasDataTypeCd: "iv", // Only sites with real-time data
  });

  const resp = await fetch(`${USGS_BASE}?${params}`, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) return [];

  const text = await resp.text();
  return parseUSGSRdb(text, regionId);
}

/**
 * Parse USGS RDB (tab-delimited) format into ResourcePoints.
 * RDB files have comment lines starting with # and a header line.
 */
function parseUSGSRdb(
  rdbText: string,
  regionId: string,
): ResourcePoint[] {
  const lines = rdbText.split("\n");
  const resources: ResourcePoint[] = [];

  // Find header line (first non-comment, non-empty line)
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && !line.startsWith("#") && line.trim().length > 0) {
      headerIndex = i;
      break;
    }
  }

  const headerLine = headerIndex === -1 ? undefined : lines[headerIndex];
  if (!headerLine) return [];

  const headers = headerLine.split("\t");
  const siteNoIdx = headers.indexOf("site_no");
  const nameIdx = headers.indexOf("station_nm");
  const latIdx = headers.indexOf("dec_lat_va");
  const lngIdx = headers.indexOf("dec_long_va");
  const typeIdx = headers.indexOf("site_tp_cd");

  if (siteNoIdx === -1 || latIdx === -1 || lngIdx === -1) return [];

  // Skip the format line (after header) and process data lines
  for (let i = headerIndex + 2; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const fields = line.split("\t");
    if (fields.length <= Math.max(siteNoIdx, latIdx, lngIdx)) continue;

    const latRaw = fields[latIdx];
    const lngRaw = fields[lngIdx];
    const siteNo = fields[siteNoIdx];
    if (latRaw === undefined || lngRaw === undefined || siteNo === undefined) {
      continue;
    }

    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    if (isNaN(lat) || isNaN(lng)) continue;

    const name =
      nameIdx >= 0 ? (fields[nameIdx] ?? `USGS ${siteNo}`) : `USGS ${siteNo}`;
    const siteType =
      typeIdx >= 0 ? (fields[typeIdx] ?? "unknown") : "unknown";

    resources.push({
      id: `usgs-${siteNo}`,
      type: "water",
      name: name.trim(),
      lat,
      lng,
      address: null,
      metadata: {
        siteNo,
        siteType,
        source: "usgs",
      },
      source: "usgs",
      fetchedAt: Date.now(),
      regionId,
    });
  }

  return resources;
}

/**
 * Fetch water sources from OpenStreetMap via Overpass API.
 * Queries for drinking water fountains, springs, and wells.
 */
async function fetchOSMWaterSources(
  bbox: BBox,
  regionId: string,
): Promise<ResourcePoint[]> {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  const query = `
    [out:json][timeout:30];
    (
      node["amenity"="drinking_water"](${bboxStr});
      node["natural"="spring"](${bboxStr});
      node["man_made"="water_well"](${bboxStr});
    );
    out body;
  `;

  const resp = await fetch(OVERPASS_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) return [];

  const data = (await resp.json()) as {
    elements: {
      id: number;
      lat: number;
      lon: number;
      tags?: Record<string, string>;
    }[];
  };

  return data.elements
    .filter((el) => el.lat && el.lon)
    .map((el) => {
      const tags = el.tags ?? {};
      const name =
        tags.name ??
        tags.description ??
        (tags.amenity === "drinking_water"
          ? "Drinking Water"
          : tags.natural === "spring"
            ? "Natural Spring"
            : "Water Well");

      return {
        id: `osm-${el.id}`,
        type: "water" as const,
        name,
        lat: el.lat,
        lng: el.lon,
        address: tags["addr:street"]
          ? `${tags["addr:street"]}, ${tags["addr:city"] ?? ""}`
          : null,
        metadata: {
          osmId: el.id,
          osmTags: tags,
        },
        source: "osm" as const,
        fetchedAt: Date.now(),
        regionId,
      };
    });
}

export { CACHE_TTL_MS };
