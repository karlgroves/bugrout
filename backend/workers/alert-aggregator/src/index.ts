/**
 * Alert Aggregator — Cloudflare Worker + KV
 *
 * Cron-triggered every 15 minutes. Polls NWS, USFS, and FEMA APIs.
 * Normalizes all alerts into unified GeoJSON ThreatZone format.
 * Stores in KV for fast edge retrieval by the mobile app.
 */

interface Env {
  ALERTS_KV: KVNamespace;
  ALLOWED_ORIGINS?: string; // Comma-separated allowed origins
}

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

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Frame-Options": "DENY",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";

    const corsHeaders = buildCorsHeaders(origin, env.ALLOWED_ORIGINS);
    const headers = { ...corsHeaders, ...SECURITY_HEADERS };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // GET /v1/alerts?bbox=west,south,east,north
    if (url.pathname === "/v1/alerts") {
      const bbox = url.searchParams.get("bbox");
      if (!bbox) {
        return Response.json(
          { error: "bbox parameter required" },
          { status: 400, headers },
        );
      }

      // Validate bbox format: four comma-separated numbers
      const bboxParts = bbox.split(",");
      if (
        bboxParts.length !== 4 ||
        bboxParts.some((p) => isNaN(parseFloat(p.trim())))
      ) {
        return Response.json(
          { error: "bbox must be four comma-separated numbers: west,south,east,north" },
          { status: 400, headers },
        );
      }

      // Read from the canonical "alerts:all" key and filter client-side
      const alerts = await env.ALERTS_KV.get("alerts:all", "json");
      if (!alerts) {
        return Response.json(
          { type: "FeatureCollection", features: [] },
          {
            headers: {
              ...headers,
              "Cache-Control": "max-age=900",
            },
          },
        );
      }

      return Response.json(alerts, {
        headers: {
          ...headers,
          "Cache-Control": "max-age=900",
        },
      });
    }

    return new Response("Not Found", { status: 404, headers });
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const threats: ThreatZone[] = [];

    // Fetch from all sources in parallel
    const results = await Promise.allSettled([
      fetchNWSAlerts(),
      fetchUSFSFirePerimeters(),
    ]);

    for (const result of results) {
      if (result.status === "fulfilled") {
        threats.push(...result.value);
      }
    }

    // Store aggregated alerts in KV
    const featureCollection = {
      type: "FeatureCollection",
      features: threats.map((t) => ({
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
      })),
    };

    // Store with 1-hour TTL as a general key
    await env.ALERTS_KV.put(
      "alerts:all",
      JSON.stringify(featureCollection),
      { expirationTtl: 3600 },
    );
  },
};

function buildCorsHeaders(
  origin: string,
  allowedOrigins?: string,
): Record<string, string> {
  const allowed = allowedOrigins
    ? allowedOrigins.split(",").map((o) => o.trim())
    : [];

  // Fail closed: if no origins configured, deny cross-origin requests
  const allowOrigin =
    allowed.length > 0 && allowed.includes(origin) ? origin : "";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

async function fetchNWSAlerts(): Promise<ThreatZone[]> {
  const resp = await fetch(
    "https://api.weather.gov/alerts/active?status=actual&message_type=alert",
    {
      headers: { "User-Agent": "BugRout/1.0 (contact@bugrout.app)" },
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!resp.ok) return [];

  const data = (await resp.json()) as {
    features: Array<{
      properties: {
        id: string;
        severity: string;
        headline: string;
        description: string;
        expires: string;
      };
      geometry: unknown;
    }>;
  };

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

async function fetchUSFSFirePerimeters(): Promise<ThreatZone[]> {
  const url =
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/NIFC_Perimeters/FeatureServer/0/query?where=1%3D1&outFields=poly_IncidentName,irwin_PercentContained&f=geojson";

  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) return [];

  const data = (await resp.json()) as {
    features: Array<{
      properties: {
        poly_IncidentName: string;
        irwin_PercentContained: number;
      };
      geometry: unknown;
    }>;
  };

  return data.features.map((f) => ({
    id: `fire-${f.properties.poly_IncidentName}`,
    type: "wildfire" as const,
    severity:
      (f.properties.irwin_PercentContained ?? 0) < 50
        ? "severe"
        : "moderate",
    geometry: f.geometry,
    headline: `Active Fire: ${f.properties.poly_IncidentName}`,
    description: `${f.properties.irwin_PercentContained ?? 0}% contained`,
    source: "usfs",
    fetchedAt: Date.now(),
    expiresAt: null,
  }));
}
