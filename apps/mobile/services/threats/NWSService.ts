/**
 * NWS (National Weather Service) Alert Service
 *
 * Fetches active weather alerts from api.weather.gov.
 * Parses CAP GeoJSON into ThreatZone format.
 * Supports both bbox-based and state-based queries.
 *
 * API docs: https://www.weather.gov/documentation/services-web-api
 */

import { upsertThreatZones } from "@/db/queries/threats";

import type { ThreatZone, BBox } from "@bugrout/shared";

const NWS_BASE = "https://api.weather.gov";
const CACHE_TTL_MS = 3600000; // 1 hour

/** Shape of the NWS /points response (fields used here may be absent). */
interface NWSPointResponse {
  properties?: {
    relativeLocation?: { properties?: { state?: string } };
  };
}

/** Shape of the NWS /alerts/active GeoJSON response. */
interface NWSAlertResponse {
  features: {
    properties: {
      id: string;
      event: string;
      severity?: string;
      certainty?: string;
      urgency?: string;
      headline?: string;
      description?: string;
      expires?: string;
      effective?: string;
    };
    geometry: ThreatZone["geometry"] | null;
  }[];
}

/**
 * Fetch active NWS alerts for a geographic area.
 * Uses area (state code) for broad queries, or point for localized queries.
 */
export async function fetchNWSAlerts(bbox: BBox): Promise<ThreatZone[]> {
  // NWS API works best with area (state) queries.
  // For bbox, we use the center point to find the forecast zone.
  const centerLat = (bbox.south + bbox.north) / 2;
  const centerLng = (bbox.west + bbox.east) / 2;

  // Try area-based query first (more reliable)
  const stateAlerts = await fetchByArea(centerLat, centerLng);
  if (stateAlerts.length > 0) {
    // Filter to bbox
    const filtered = stateAlerts.filter((a) =>
      alertIntersectsBBox(a, bbox),
    );
    if (filtered.length > 0) {
      await upsertThreatZones(filtered);
      return filtered;
    }
    return stateAlerts;
  }

  return [];
}

/**
 * Fetch alerts by finding the state for a given lat/lng.
 */
async function fetchByArea(
  lat: number,
  lng: number,
): Promise<ThreatZone[]> {
  // First, get the state from the NWS points API
  try {
    const pointResp = await fetch(
      `${NWS_BASE}/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
      {
        headers: {
          "User-Agent": "BugRout/1.0 (contact@bugrout.app)",
          Accept: "application/geo+json",
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!pointResp.ok) return [];

    const pointData = (await pointResp.json()) as NWSPointResponse;

    const state = pointData.properties?.relativeLocation?.properties?.state;
    if (!state) return [];

    // Fetch alerts for the state
    const alertResp = await fetch(
      `${NWS_BASE}/alerts/active?area=${state}&status=actual&message_type=alert`,
      {
        headers: {
          "User-Agent": "BugRout/1.0 (contact@bugrout.app)",
          Accept: "application/geo+json",
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!alertResp.ok) return [];

    return parseNWSResponse((await alertResp.json()) as NWSAlertResponse);
  } catch {
    return [];
  }
}

/**
 * Parse NWS GeoJSON response into ThreatZone array.
 */
function parseNWSResponse(data: NWSAlertResponse): ThreatZone[] {
  return data.features.flatMap((f) => {
    const geometry = f.geometry;
    if (geometry === null) return [];
    return [
      {
        id: f.properties.id,
        type: classifyNWSEvent(f.properties.event),
        severity: mapSeverity(f.properties.severity),
        geometry,
        headline: f.properties.headline ?? f.properties.event,
        description: truncateDescription(f.properties.description ?? ""),
        source: "nws" as const,
        fetchedAt: Date.now(),
        expiresAt: f.properties.expires
          ? new Date(f.properties.expires).getTime()
          : null,
      },
    ];
  });
}

/**
 * Classify NWS event type into our threat categories.
 */
function classifyNWSEvent(event: string): ThreatZone["type"] {
  const lower = event.toLowerCase();

  // Fire events
  if (
    lower.includes("fire") ||
    lower.includes("red flag") ||
    lower.includes("smoke")
  ) {
    return "wildfire";
  }

  // Flood events
  if (
    lower.includes("flood") ||
    lower.includes("surge") ||
    lower.includes("tsunami") ||
    lower.includes("coastal")
  ) {
    return "flood";
  }

  // Everything else is weather
  return "weather";
}

/**
 * Map NWS severity to our severity levels.
 */
function mapSeverity(nwsSeverity: string | undefined): ThreatZone["severity"] {
  switch ((nwsSeverity ?? "").toLowerCase()) {
    case "extreme":
      return "extreme";
    case "severe":
      return "severe";
    case "moderate":
      return "moderate";
    case "minor":
      return "minor";
    default:
      return "unknown";
  }
}

/**
 * Check if a threat zone's geometry roughly intersects a bbox.
 * Simplified: checks if any part of the threat geometry overlaps the bbox.
 */
function alertIntersectsBBox(threat: ThreatZone, bbox: BBox): boolean {
  // Extract all coordinates from the geometry
  const coords = extractCoordinates(threat.geometry);

  // Check if any coordinate falls within the bbox
  return coords.some(
    ([lng, lat]) =>
      lng !== undefined &&
      lat !== undefined &&
      lat >= bbox.south &&
      lat <= bbox.north &&
      lng >= bbox.west &&
      lng <= bbox.east,
  );
}

/**
 * Flatten a threat geometry into a list of [lng, lat] coordinate pairs.
 */
function extractCoordinates(
  geometry: ThreatZone["geometry"],
): number[][] {
  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] ?? [];
  }
  return geometry.coordinates.flatMap((poly) => poly[0] ?? []);
}

/**
 * Truncate long NWS descriptions for storage efficiency.
 */
function truncateDescription(desc: string): string {
  if (desc.length <= 500) return desc;
  return desc.slice(0, 497) + "...";
}

export { CACHE_TTL_MS };
