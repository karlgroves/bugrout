/**
 * Crowd Signal — Cloudflare Worker + KV
 *
 * Receives anonymous speed/heading telemetry from app users.
 * No PII. Device token rotates every 24 hours.
 * Data retained max 48 hours.
 *
 * Security:
 * - IP-based rate limiting (60 requests/minute per IP)
 * - Payload validation and size limits
 * - CORS restricted to app origins
 */

import { SECURITY_HEADERS, buildCorsHeaders } from "@bugrout/worker-utils";

/**
 * Cloudflare Worker bindings available to the crowd-signal worker.
 */
interface Env {
  SIGNALS_KV: KVNamespace;
  ALLOWED_ORIGINS?: string; // comma-separated, e.g. "https://bugrout.app"
}

/**
 * Anonymous telemetry payload posted by app clients. Optional numeric fields
 * may be absent in malformed or partial requests.
 */
interface SignalPayload {
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  ts?: number;
  token: string;
}

const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 60; // requests per window per IP
const MAX_BODY_SIZE = 1024; // 1 KB max payload

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") ?? "";

    const corsHeaders = buildCorsHeaders(origin, env.ALLOWED_ORIGINS, {
      methods: "GET, POST, OPTIONS",
      allowHeaders: "Content-Type",
      maxAge: 86400,
    });
    const headers = { ...corsHeaders, ...SECURITY_HEADERS };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // POST /v1/signal — ingest telemetry
    if (request.method === "POST" && url.pathname === "/v1/signal") {
      return handleSignalIngest(request, env, headers);
    }

    // GET /v1/signal?bbox=west,south,east,north
    if (request.method === "GET" && url.pathname === "/v1/signal") {
      return Response.json(
        { signals: [] },
        {
          headers: {
            ...headers,
            "Cache-Control": "max-age=30",
          },
        },
      );
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response("ok", { headers });
    }

    return new Response("Not Found", { status: 404, headers });
  },
};

/**
 * Validate, rate-limit, and persist an incoming telemetry signal.
 */
async function handleSignalIngest(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // Rate limit by IP
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const rateLimited = await checkRateLimit(env.SIGNALS_KV, clientIp);
  if (rateLimited) {
    return Response.json({ error: "Rate limited" }, { status: 429, headers });
  }

  // Validate content length
  const contentLength = parseInt(
    request.headers.get("Content-Length") ?? "0",
    10,
  );
  if (contentLength > MAX_BODY_SIZE) {
    return Response.json(
      { error: "Payload too large" },
      { status: 413, headers },
    );
  }

  let payload: SignalPayload;
  try {
    payload = await request.json<SignalPayload>();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  if (!isValidSignal(payload)) {
    return Response.json(
      { error: "Invalid payload" },
      { status: 400, headers },
    );
  }

  // Sanitize and store
  const key = `signal:${sanitizeToken(payload.token)}:${Math.floor(Date.now() / 1000)}`;
  await env.SIGNALS_KV.put(
    key,
    JSON.stringify({
      lat: roundCoord(payload.lat),
      lng: roundCoord(payload.lng),
      speed: Math.max(0, Math.min(200, payload.speed ?? 0)),
      heading: Math.max(0, Math.min(360, payload.heading ?? 0)),
      ts: Date.now(),
    }),
    { expirationTtl: 172800 },
  );

  return new Response(null, { status: 204, headers });
}

/**
 * Validate that a telemetry payload has well-formed coordinates and a token.
 */
function isValidSignal(payload: SignalPayload): boolean {
  return (
    typeof payload.lat === "number" &&
    typeof payload.lng === "number" &&
    typeof payload.token === "string" &&
    !!payload.token &&
    payload.lat >= -90 &&
    payload.lat <= 90 &&
    payload.lng >= -180 &&
    payload.lng <= 180
  );
}

/**
 * Increment and check the per-IP rate-limit counter; returns true when over the limit.
 */
async function checkRateLimit(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = `ratelimit:${ip}`;
  const current = parseInt((await kv.get(key)) ?? "0", 10);

  if (current >= RATE_LIMIT_MAX) {
    return true;
  }

  await kv.put(key, String(current + 1), {
    expirationTtl: RATE_LIMIT_WINDOW,
  });
  return false;
}

/**
 * Strip non-alphanumeric characters from a device token and cap its length.
 */
function sanitizeToken(token: string): string {
  return token.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
}

/**
 * Round a coordinate to ~11m precision to coarsen location data before storage.
 */
function roundCoord(coord: number): number {
  return Math.round(coord * 10000) / 10000;
}
