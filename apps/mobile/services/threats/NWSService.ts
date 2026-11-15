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
import { timeoutSignal } from "@/utils/abort";
import {
  boundedFeatures,
  capText,
  MAX_HEADLINE_CHARS,
  readJsonBounded,
} from "@/utils/feedBounds";
import { extractRingCoordinates, sanitizeThreatGeometry } from "@/utils/geo";

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
 * Fetch the active NWS alerts that fall in a geographic area.
 *
 * NWS is asked for the whole state at the area's centre, and the answer is
 * narrowed to the area. Resolves to `[]` when the state has alerts but none
 * reaches the area: handing back the state's full list instead (#359) stored
 * and drew out-of-area alerts as this area's, and only when no alert was
 * in-area, so one nearby alert was enough to make the others disappear.
 */
export async function fetchNWSAlerts(bbox: BBox): Promise<ThreatZone[]> {
  // NWS API works best with area (state) queries.
  // For bbox, we use the center point to find the state.
  const centerLat = (bbox.south + bbox.north) / 2;
  const centerLng = (bbox.west + bbox.east) / 2;

  const stateAlerts = await fetchByArea(centerLat, centerLng);
  const inArea = stateAlerts.filter((a) => alertIntersectsBBox(a, bbox));
  if (inArea.length > 0) await upsertThreatZones(inArea);
  return inArea;
}

/**
 * Fetch alerts by finding the state for a given lat/lng.
 *
 * Throws when either request fails or times out, or when the points response
 * names no state: a failure must not read as "no active alerts" (#288). The
 * caller keeps the cached alerts and retries.
 */
async function fetchByArea(lat: number, lng: number): Promise<ThreatZone[]> {
  // First, get the state from the NWS points API
  const pointResp = await fetch(
    `${NWS_BASE}/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
    {
      headers: {
        "User-Agent": "BugRout/1.0 (contact@bugrout.app)",
        Accept: "application/geo+json",
      },
      signal: timeoutSignal(10000),
    },
  );

  if (!pointResp.ok) throw new Error(`NWS points: HTTP ${pointResp.status}`);

  const pointData = (await pointResp.json()) as NWSPointResponse;

  const state = pointData.properties?.relativeLocation?.properties?.state;
  // No state means the alerts query was never made, so this is a failed
  // fetch, not "no active alerts" (#288). Resolving to [] here used only to
  // hide the notice; now that an empty result CLEARS the source (#338) it
  // would also drop the cached alerts.
  if (!state) {
    throw new Error("NWS points: no state in the points response");
  }

  // Fetch alerts for the state
  const alertResp = await fetch(
    `${NWS_BASE}/alerts/active?area=${state}&status=actual&message_type=alert`,
    {
      headers: {
        "User-Agent": "BugRout/1.0 (contact@bugrout.app)",
        Accept: "application/geo+json",
      },
      signal: timeoutSignal(15000),
    },
  );

  if (!alertResp.ok) {
    throw new Error(`NWS alerts: HTTP ${alertResp.status}`);
  }

  return parseNWSResponse(await readJsonBounded<NWSAlertResponse>(alertResp));
}

/**
 * Parse NWS GeoJSON response into ThreatZone array.
 *
 * Throws when the response holds more alerts than `MAX_FEED_FEATURES` (#305).
 */
export function parseNWSResponse(data: NWSAlertResponse): ThreatZone[] {
  return boundedFeatures(data.features, "NWS alerts").flatMap((f) => {
    // Zone-based alerts have no geometry; malformed ones are dropped too (#287).
    const geometry = sanitizeThreatGeometry(f.geometry);
    if (geometry === null) return [];
    return [
      {
        id: f.properties.id,
        type: classifyNWSEvent(f.properties.event),
        severity: mapSeverity(f.properties.severity),
        geometry,
        headline: capText(
          f.properties.headline ?? f.properties.event,
          MAX_HEADLINE_CHARS,
        ),
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
 * Whether a threat zone may reach a bbox: its own extent overlaps the bbox.
 *
 * Deliberately errs towards keeping an alert. Testing for a vertex inside the
 * bbox missed a polygon that covers the area, or crosses a corner of it, with
 * every vertex outside (#359); this can only keep a near miss, never drop an
 * alert that does reach the area. A geometry with no coordinates is dropped.
 */
function alertIntersectsBBox(threat: ThreatZone, bbox: BBox): boolean {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of extractRingCoordinates(threat.geometry)) {
    if (lng === undefined || lat === undefined) continue;
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }

  return (
    west <= bbox.east &&
    east >= bbox.west &&
    south <= bbox.north &&
    north >= bbox.south
  );
}

/**
 * Truncate long NWS descriptions for storage efficiency.
 */
function truncateDescription(desc: string): string {
  if (desc.length <= 500) return desc;
  return desc.slice(0, 497) + "...";
}

export { CACHE_TTL_MS };
