/**
 * Alert Aggregator — Cloudflare Worker + KV
 *
 * Cron-triggered every 15 minutes. Polls NWS and USFS/NIFC.
 * Normalizes all alerts into unified GeoJSON ThreatZone format.
 * Stores in KV for fast edge retrieval by the mobile app.
 *
 * Integrity rules (#301):
 * - Each source has its own KV key, written only when that source's poll
 *   succeeded. A failed poll never replaces the last good data, and a source
 *   that failed is never recorded as "no threats".
 * - Every stored set carries the time it was fetched, and the read path
 *   reports it, so a client can tell stale data from fresh data.
 * - A source with no data at all is reported as missing. When every source is
 *   missing the read path answers 503, never a cacheable empty 200.
 * - The read path returns only the features that intersect the requested
 *   bbox, and refuses a bbox larger than MAX_BBOX_SPAN_DEGREES.
 */

import { initWorkerRequest } from "@bugrout/worker-utils";

/**
 * Cloudflare Worker bindings available to this aggregator.
 */
interface Env {
  ALERTS_KV: KVNamespace;
  ALLOWED_ORIGINS?: string; // Comma-separated allowed origins
}

/**
 * Normalized threat zone derived from an upstream alert source.
 */
interface ThreatZone {
  id: string;
  type: "wildfire" | "flood" | "weather";
  severity: string;
  geometry: unknown;
  headline: string;
  description: string;
  source: string;
  fetchedAt: number;
  expiresAt: number | null;
}

/**
 * Subset of the NWS active-alerts GeoJSON response that this worker consumes.
 */
interface NWSAlertsResponse {
  features: {
    properties: {
      id: string;
      severity?: string;
      headline?: string;
      description?: string;
      expires?: string;
    };
    geometry: unknown;
  }[];
}

// The NIFC_Perimeters layer this used to query was withdrawn: the query
// answers HTTP 400 and a metadata request answers an ArcGIS 400 "Invalid
// URL", so the usfs poll could only ever fail — and since #325 that failure
// leaves the source permanently missing (#336).
// WFIGS_Interagency_Perimeters_Current is the same org's live
// current-perimeters layer.
//
// Its schema is WFIGS's: containment is `attr_PercentContained`, and the old
// `irwin_` name does not exist on it. Asking for a field the layer does not
// define is not a soft failure — it answers HTTP 200 with
// `{"error":...,"details":["'outFields' parameter is invalid"]}` and no
// `features` array — so the names requested here and the names read in
// `USFSPerimetersResponse` must stay identical. `pnpm run threats:check`
// reads this literal and asserts both against the live layer.
const NIFC_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?where=1%3D1&outFields=poly_IncidentName,attr_PercentContained&f=geojson";

/**
 * Subset of the NIFC/USFS fire-perimeter GeoJSON response that this worker consumes.
 */
interface USFSPerimetersResponse {
  features: {
    properties: {
      poly_IncidentName: string;
      attr_PercentContained?: number | null;
    };
    geometry: unknown;
  }[];
}

/** Upstream sources, each stored under its own KV key. */
const SOURCES = ["nws", "usfs"] as const;

/** One upstream source's name. */
type Source = (typeof SOURCES)[number];

/**
 * KV TTL for a source's last good set. Far longer than the 15-minute cron
 * interval, so a few missed or failed ticks degrade to stale data with a
 * timestamp rather than to silence.
 */
const SOURCE_TTL_SECONDS = 6 * 60 * 60;

/**
 * Largest bbox side the read path serves, in degrees. Large enough for any
 * single state in the lower 48; small enough that one request cannot pull the
 * whole national set.
 */
const MAX_BBOX_SPAN_DEGREES = 30;

/**
 * One source's last successful poll, as stored in KV.
 */
interface SourceSnapshot {
  fetchedAt: number;
  features: AlertFeature[];
}

/**
 * GeoJSON feature served to clients.
 */
interface AlertFeature {
  type: "Feature";
  geometry: unknown;
  properties: Record<string, unknown>;
}

/**
 * A validated bounding box: west, south, east, north in degrees.
 */
type BBox = readonly [number, number, number, number];

/**
 * KV key holding one source's last good snapshot.
 *
 * @param source - The upstream source.
 * @returns The KV key.
 */
function sourceKey(source: Source): string {
  return `alerts:${source}`;
}

const BBOX_FORMAT_ERROR =
  "bbox must be four comma-separated numbers: west,south,east,north";

/**
 * Check a bbox lies on the globe, is not inverted, and is not too large.
 *
 * @param bbox - West, south, east, north.
 * @returns An error message for a 400, or null when the bbox is acceptable.
 */
function bboxRangeError([west, south, east, north]: BBox): string | null {
  const onGlobe = west >= -180 && east <= 180 && south >= -90 && north <= 90;
  if (!onGlobe || west > east || south > north) {
    return "bbox must satisfy -180 <= west <= east <= 180 and -90 <= south <= north <= 90";
  }
  if (
    east - west > MAX_BBOX_SPAN_DEGREES ||
    north - south > MAX_BBOX_SPAN_DEGREES
  ) {
    return `bbox may span at most ${String(MAX_BBOX_SPAN_DEGREES)} degrees on each side`;
  }
  return null;
}

/**
 * Parse and validate a `west,south,east,north` bbox string.
 *
 * @param raw - The query-string value.
 * @returns The bbox, or an error message for a 400.
 */
function parseBBox(raw: string): BBox | string {
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length !== 4 || parts.includes("")) return BBOX_FORMAT_ERROR;
  const numbers = parts.map(Number);
  if (!numbers.every(Number.isFinite)) return BBOX_FORMAT_ERROR;
  const bbox = numbers as unknown as BBox;
  return bboxRangeError(bbox) ?? bbox;
}

/**
 * Extent of a GeoJSON geometry, found by walking its coordinate arrays.
 *
 * @param geometry - Any GeoJSON geometry object.
 * @returns The extent, or null when the geometry holds no coordinates.
 */
function geometryExtent(geometry: unknown): BBox | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    const [x, y] = node as unknown[];
    if (typeof x === "number" && typeof y === "number") {
      west = Math.min(west, x);
      east = Math.max(east, x);
      south = Math.min(south, y);
      north = Math.max(north, y);
      return;
    }
    for (const child of node) visit(child);
  };

  if (geometry !== null && typeof geometry === "object") {
    const g = geometry as { coordinates?: unknown; geometries?: unknown };
    visit(g.coordinates);
    if (Array.isArray(g.geometries)) {
      for (const child of g.geometries) {
        const extent = geometryExtent(child);
        if (extent) {
          west = Math.min(west, extent[0]);
          south = Math.min(south, extent[1]);
          east = Math.max(east, extent[2]);
          north = Math.max(north, extent[3]);
        }
      }
    }
  }

  return Number.isFinite(west) ? [west, south, east, north] : null;
}

/**
 * Whether a feature's extent overlaps the requested bbox.
 *
 * @param feature - The feature to test.
 * @param bbox - The requested bbox.
 * @returns True when the extents overlap.
 */
function intersectsBBox(feature: AlertFeature, bbox: BBox): boolean {
  const extent = geometryExtent(feature.geometry);
  if (!extent) return false;
  return (
    extent[0] <= bbox[2] &&
    extent[2] >= bbox[0] &&
    extent[1] <= bbox[3] &&
    extent[3] >= bbox[1]
  );
}

/**
 * Convert normalized threats into served GeoJSON features.
 *
 * @param threats - The normalized threats.
 * @returns The GeoJSON features.
 */
function toFeatures(threats: ThreatZone[]): AlertFeature[] {
  return threats.map((t) => ({
    type: "Feature",
    geometry: t.geometry,
    properties: {
      id: t.id,
      threatType: t.type,
      severity: t.severity,
      headline: t.headline,
      description: t.description,
      source: t.source,
      fetchedAt: t.fetchedAt,
      expiresAt: t.expiresAt,
    },
  }));
}

/**
 * Poll one upstream source.
 *
 * @param source - The upstream source.
 * @returns Its normalized threats. Rejects when the poll failed.
 */
function pollSource(source: Source): Promise<ThreatZone[]> {
  return source === "nws" ? fetchNWSAlerts() : fetchUSFSFirePerimeters();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { url, headers, isPreflight } = initWorkerRequest(
      request,
      env.ALLOWED_ORIGINS,
      { methods: "GET, OPTIONS" },
    );

    if (isPreflight) return new Response(null, { headers });

    // GET /v1/alerts?bbox=west,south,east,north
    if (url.pathname === "/v1/alerts") {
      const raw = url.searchParams.get("bbox");
      if (!raw) {
        return Response.json(
          { error: "bbox parameter required" },
          { status: 400, headers },
        );
      }

      const bbox = parseBBox(raw);
      if (typeof bbox === "string") {
        return Response.json({ error: bbox }, { status: 400, headers });
      }

      const snapshots = await Promise.all(
        SOURCES.map(
          async (source) =>
            [
              source,
              await env.ALERTS_KV.get<SourceSnapshot>(
                sourceKey(source),
                "json",
              ),
            ] as const,
        ),
      );
      const missingSources = snapshots
        .filter(([, snapshot]) => !snapshot)
        .map(([source]) => source);

      if (missingSources.length === SOURCES.length) {
        return Response.json(
          { error: "Alert data unavailable", missingSources },
          {
            status: 503,
            headers: { ...headers, "Cache-Control": "no-store" },
          },
        );
      }

      const present = snapshots.filter(
        (entry): entry is readonly [Source, SourceSnapshot] => !!entry[1],
      );
      const sources = Object.fromEntries(
        present.map(([source, snapshot]) => [
          source,
          { fetchedAt: snapshot.fetchedAt },
        ]),
      );
      const features = present.flatMap(([, snapshot]) =>
        snapshot.features.filter((f) => intersectsBBox(f, bbox)),
      );

      return Response.json(
        { type: "FeatureCollection", sources, missingSources, features },
        {
          headers: {
            ...headers,
            // A partial answer must not be cached as if it were complete.
            "Cache-Control":
              missingSources.length === 0 ? "max-age=900" : "no-store",
          },
        },
      );
    }

    return new Response("Not Found", { status: 404, headers });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await Promise.all(
      SOURCES.map(async (source) => {
        let threats: ThreatZone[];
        try {
          threats = await pollSource(source);
        } catch (reason) {
          // Keep the last good set: a failed poll must not replace it, and
          // must not be recorded as "no threats".
          console.error(
            `[alert-aggregator] ${source} poll failed; keeping the last good set`,
            reason,
          );
          return;
        }
        const snapshot: SourceSnapshot = {
          fetchedAt: Date.now(),
          features: toFeatures(threats),
        };
        await env.ALERTS_KV.put(sourceKey(source), JSON.stringify(snapshot), {
          expirationTtl: SOURCE_TTL_SECONDS,
        });
      }),
    );
  },
};

/**
 * Fetch active NWS weather alerts and normalize them into ThreatZones.
 */
async function fetchNWSAlerts(): Promise<ThreatZone[]> {
  const resp = await fetch(
    "https://api.weather.gov/alerts/active?status=actual&message_type=alert",
    {
      headers: { "User-Agent": "BugRout/1.0 (contact@bugrout.app)" },
      signal: AbortSignal.timeout(15000),
    },
  );

  // Throw rather than return []: a failed poll is not "no alerts".
  if (!resp.ok) throw new Error(`NWS responded ${String(resp.status)}`);

  const data = await resp.json<NWSAlertsResponse>();

  return data.features
    .filter((f) => f.geometry !== null)
    .map((f) => ({
      id: f.properties.id,
      type: "weather" as const,
      severity: f.properties.severity?.toLowerCase() ?? "unknown",
      geometry: f.geometry,
      headline: f.properties.headline ?? "",
      description: f.properties.description ?? "",
      source: "nws",
      fetchedAt: Date.now(),
      expiresAt: f.properties.expires
        ? new Date(f.properties.expires).getTime()
        : null,
    }));
}

/**
 * Fetch active USFS/NIFC fire perimeters and normalize them into ThreatZones.
 */
async function fetchUSFSFirePerimeters(): Promise<ThreatZone[]> {
  const resp = await fetch(NIFC_URL, { signal: AbortSignal.timeout(15000) });
  // Throw rather than return []: a failed poll is not "no fires".
  if (!resp.ok) throw new Error(`NIFC responded ${String(resp.status)}`);

  const data = await resp.json<USFSPerimetersResponse>();

  return data.features.map((f) => ({
    id: `fire-${f.properties.poly_IncidentName}`,
    type: "wildfire" as const,
    severity:
      (f.properties.attr_PercentContained ?? 0) < 50 ? "severe" : "moderate",
    geometry: f.geometry,
    headline: `Active Fire: ${f.properties.poly_IncidentName}`,
    description: `${f.properties.attr_PercentContained ?? 0}% contained`,
    source: "usfs",
    fetchedAt: Date.now(),
    expiresAt: null,
  }));
}
