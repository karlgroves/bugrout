/**
 * Crowd Signal — Cloudflare Worker + KV
 *
 * Receives anonymous speed/heading telemetry from app users.
 * No PII. Device token rotates every 24 hours.
 * Data retained max 48 hours.
 *
 * Security:
 * - IP-based rate limiting (60 requests/minute per IP) through the Workers
 *   Rate Limiting binding. It used to be a get-then-put counter in KV, which
 *   has no atomic increment and is cached at the edge, so a parallel burst all
 *   read the same count and all got through (#297).
 * - A 1 KB body cap enforced on the bytes actually read. Content-Length is
 *   only a cheap early reject: it is client-supplied, may be absent (chunked,
 *   HTTP/2) or unparseable (`abc` parses to NaN, which compares false).
 * - Payload validation, including the token's shape: the app sends a UUID, so
 *   anything else is rejected rather than sanitized into a key.
 * - CORS restricted to app origins
 */

import { initWorkerRequest } from "@bugrout/worker-utils";

/**
 * Cloudflare Worker bindings available to the crowd-signal worker.
 */
interface Env {
  SIGNALS_KV: KVNamespace;
  /** Per-IP limiter; limit and period live in wrangler.toml `[[ratelimits]]`. */
  RATE_LIMITER: RateLimit;
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

const MAX_BODY_SIZE = 1024; // 1 KB max payload
/** Seconds a 429'd client should wait; matches the limiter's 60 s period. */
const RATE_LIMIT_RETRY_AFTER = "60";
/** One stored signal per token per this many ms: the app's own send interval. */
const SIGNAL_BUCKET_MS = 10_000;
/** The device token the app mints: a UUID (iOS reports it in upper case). */
const TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { url, headers, isPreflight } = initWorkerRequest(
      request,
      env.ALLOWED_ORIGINS,
      {
        methods: "GET, POST, OPTIONS",
        allowHeaders: "Content-Type",
        maxAge: 86400,
      },
    );

    if (isPreflight) return new Response(null, { headers });

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
  const { success } = await env.RATE_LIMITER.limit({ key: clientIp });
  if (!success) {
    return Response.json(
      { error: "Rate limited" },
      {
        status: 429,
        headers: { ...headers, "Retry-After": RATE_LIMIT_RETRY_AFTER },
      },
    );
  }

  const raw = await readBodyCapped(request, MAX_BODY_SIZE);
  if (raw === null) {
    return Response.json(
      { error: "Payload too large" },
      { status: 413, headers },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  if (!isValidSignal(payload)) {
    return Response.json(
      { error: "Invalid payload" },
      { status: 400, headers },
    );
  }

  // One key per token per 10 s bucket, so a flood from one token overwrites
  // its own key instead of adding keys.
  const bucket = Math.floor(Date.now() / SIGNAL_BUCKET_MS);
  const key = `signal:${payload.token.toLowerCase()}:${bucket}`;
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
 * Read the request body as text, refusing to buffer more than `limit` bytes.
 *
 * The declared Content-Length is checked first as a cheap early reject, but it
 * is never trusted: the stream is counted as it is read and abandoned as soon
 * as it passes the limit, so a missing, chunked or lying header gains nothing.
 *
 * @param request - The incoming request.
 * @param limit - Maximum body size in bytes.
 * @returns The body text, or null when it is larger than `limit`.
 */
async function readBodyCapped(
  request: Request,
  limit: number,
): Promise<string | null> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";

  const reader =
    request.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Validate that a telemetry payload has well-formed coordinates and a
 * UUID-shaped token. The payload is untrusted JSON, so it may not be an
 * object at all.
 */
function isValidSignal(value: unknown): value is SignalPayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Partial<SignalPayload>;
  return (
    typeof payload.lat === "number" &&
    typeof payload.lng === "number" &&
    typeof payload.token === "string" &&
    TOKEN_PATTERN.test(payload.token) &&
    payload.lat >= -90 &&
    payload.lat <= 90 &&
    payload.lng >= -180 &&
    payload.lng <= 180
  );
}

/**
 * Round a coordinate to ~11m precision to coarsen location data before storage.
 */
function roundCoord(coord: number): number {
  return Math.round(coord * 10000) / 10000;
}
