/**
 * Route Tracker — Fly.io + Redis
 *
 * Tracks active route assignments per road segment for load distribution.
 * When online, the app reports which edges its route uses.
 * The routing engine queries density to softly bias away from over-assigned edges.
 *
 * All data expires after 2 hours (active evacuation window).
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { SECURITY_HEADERS } from "@bugrout/worker-utils";
import Redis from "ioredis";

const EDGE_TTL = 7200; // 2 hours
const PORT = parseInt(process.env.PORT ?? "8080", 10);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
/**
 * The configured Bearer secret, read per request rather than at module load.
 *
 * Reading it lazily lets the process pick up a rotated secret without a
 * restart, and lets the security regression tests exercise both the
 * configured and unconfigured paths in one run.
 *
 * @returns The secret, or an empty string when unset.
 */
function apiSecret(): string {
  return process.env.API_SECRET ?? "";
}
const MAX_BODY_SIZE = 65536; // 64 KB
const MAX_EDGE_IDS = 1000;
const REGION_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const EDGE_ID_PATTERN = /^[a-zA-Z0-9_:-]{1,128}$/;

// Simple in-memory rate limiter: max 120 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

let redisClient: Redis | null = null;

/**
 * The shared Redis client, created on first use.
 *
 * Lazy rather than module-level so that importing this module — which the
 * security regression tests in `security/tests/` do — does not open a
 * connection or keep the process alive.
 *
 * @returns The process-wide Redis client.
 */
function redisConn(): Redis {
  redisClient ??= new Redis(REDIS_URL);
  return redisClient;
}

/**
 * Replace the Redis client.
 *
 * Exists so the endpoint security regression tests in `security/tests/` can
 * exercise the real request path — auth, validation, size limits, routing —
 * against an in-memory double instead of a live Redis. Without it those tests
 * would hang on ioredis's reconnect loop, and the alternative (asserting on
 * source text instead of behaviour) pins nothing.
 *
 * Passing `null` restores the lazily-created real client.
 *
 * @param client - The client to use, or null to reset.
 */
export function setRedisClient(client: Redis | null): void {
  redisClient = client;
}

const JSON_CONTENT_TYPE = { "Content-Type": "application/json" };

/**
 * Top-level HTTP request handler: rate-limiting, CORS, auth, then route dispatch.
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const clientIp = resolveClientIp(req);

  // Headers first. The rate-limit short-circuit below returns before route
  // dispatch, and previously did so before any security header was set, so
  // every 429 went out bare. #86 makes the same move for the same reason.
  setStandardHeaders(req, res);

  // Rate limiting
  if (isRateLimited(clientIp)) {
    res.writeHead(429, JSON_CONTENT_TYPE);
    res.end(JSON.stringify({ error: "Rate limited" }));
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Authenticate all non-health endpoints
  if (req.url !== "/health" && !authenticate(req, res)) {
    return;
  }

  await routeRequest(req, res);
}

/**
 * Dispatch an authenticated request to the matching endpoint handler.
 */
async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // POST /v1/assignment — report route edge usage
  if (req.method === "POST" && req.url === "/v1/assignment") {
    await handleAssignment(req, res);
    return;
  }

  // GET /v1/density/:regionId — get edge assignment counts
  const densityMatch = req.url?.match(
    /^\/v1\/density\/([a-z][a-z0-9-]{0,63})$/,
  );
  if (req.method === "GET" && densityMatch) {
    await handleDensity(densityMatch[1] ?? "", res);
    return;
  }

  // Health check
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
}

/**
 * Resolve the client IP, preferring the first X-Forwarded-For entry.
 */
function resolveClientIp(req: IncomingMessage): string {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

/**
 * Apply CORS and security headers to the response.
 *
 * The security headers come from {@link SECURITY_HEADERS} in
 * `@bugrout/worker-utils` — the same table the three Workers apply. This
 * service used to hand-roll two of them, which meant the shared constant could
 * be extended without route-tracker ever picking the change up.
 */
function setStandardHeaders(req: IncomingMessage, res: ServerResponse): void {
  // CORS — only allow configured origins (or none in production)
  const allowedOrigins =
    process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? [];
  const origin = req.headers.origin ?? "";
  const corsOrigin =
    allowedOrigins.length > 0 && allowedOrigins.includes(origin) ? origin : "";

  // nosemgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration -- corsOrigin is either "" or an exact match from the ALLOWED_ORIGINS env allowlist, never attacker-controlled
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}

/**
 * Verify the Bearer API secret; writes an error response and returns false on failure.
 */
function authenticate(req: IncomingMessage, res: ServerResponse): boolean {
  const secret = apiSecret();
  if (!secret) {
    res.writeHead(503, JSON_CONTENT_TYPE);
    res.end(JSON.stringify({ error: "Service not configured" }));
    return false;
  }
  const authHeader = req.headers.authorization ?? "";
  const providedSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";
  if (!timingSafeEqual(providedSecret, secret)) {
    res.writeHead(401, JSON_CONTENT_TYPE);
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return false;
  }
  return true;
}

/**
 * Parse and validate an assignment payload, returning it or null after responding.
 */
async function parseAssignment(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<{ edgeIds: string[]; regionId: string } | null> {
  let body: string;
  try {
    body = await readBody(req, MAX_BODY_SIZE);
  } catch {
    res.writeHead(413, JSON_CONTENT_TYPE);
    res.end(JSON.stringify({ error: "Payload too large" }));
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, JSON_CONTENT_TYPE);
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return null;
  }

  // `parsed` is whatever JSON.parse returned, which includes null and the
  // primitives. Destructuring null throws, and that TypeError escaped the
  // handler entirely: the response never ended and the rejection surfaced as
  // an unhandled promise rejection, which Node 22 treats as fatal. A body of
  // literal `null` from an authenticated caller was enough to take the
  // service down. Found by security/tests/input-validation.security.test.ts.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    res.writeHead(400, JSON_CONTENT_TYPE);
    res.end(JSON.stringify({ error: "Invalid payload" }));
    return null;
  }

  const { edgeIds, regionId } = parsed as {
    edgeIds: string[];
    regionId: string;
  };

  const error = validateAssignmentShape(edgeIds, regionId);
  if (error) {
    res.writeHead(400);
    res.end(JSON.stringify({ error }));
    return null;
  }

  return { edgeIds, regionId };
}

/**
 * Validate an assignment's shape; returns an error message, or null when valid.
 */
function validateAssignmentShape(
  edgeIds: string[],
  regionId: string,
): string | null {
  if (!Array.isArray(edgeIds) || typeof regionId !== "string") {
    return "edgeIds (array) and regionId (string) required";
  }
  if (!REGION_ID_PATTERN.test(regionId)) {
    return "Invalid regionId format";
  }
  if (edgeIds.length === 0 || edgeIds.length > MAX_EDGE_IDS) {
    return `edgeIds must have 1-${MAX_EDGE_IDS} entries`;
  }
  for (const edgeId of edgeIds) {
    if (typeof edgeId !== "string" || !EDGE_ID_PATTERN.test(edgeId)) {
      return "Invalid edgeId format";
    }
  }
  return null;
}

/**
 * Handle POST /v1/assignment: record edge usage counts in Redis with a TTL.
 */
async function handleAssignment(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const assignment = await parseAssignment(req, res);
  if (!assignment) return;

  const { edgeIds, regionId } = assignment;
  const pipeline = redisConn().pipeline();
  for (const edgeId of edgeIds) {
    const key = `density:${regionId}:${edgeId}`;
    pipeline.incr(key);
    pipeline.expire(key, EDGE_TTL);
  }
  await pipeline.exec();

  res.writeHead(204);
  res.end();
}

/**
 * Handle GET /v1/density/:regionId: return per-edge assignment counts.
 */
async function handleDensity(
  regionId: string,
  res: ServerResponse,
): Promise<void> {
  const pattern = `density:${regionId}:*`;

  // Use SCAN instead of KEYS to avoid blocking Redis
  const edges: Record<string, number> = {};
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redisConn().scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      200,
    );
    cursor = nextCursor;

    if (keys.length > 0) {
      const values = await redisConn().mget(keys);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key === undefined) continue;
        const edgeId = key.replace(`density:${regionId}:`, "");
        edges[edgeId] = parseInt(values[i] ?? "0", 10);
      }
    }
  } while (cursor !== "0");

  res.writeHead(200, JSON_CONTENT_TYPE);
  res.end(JSON.stringify({ edges }));
}

/**
 * Read the request body into a string, rejecting if it exceeds maxSize bytes.
 */
function readBody(req: IncomingMessage, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString());
    });
    req.on("error", reject);
  });
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against b anyway to avoid leaking length info via timing
    let result = a.length ^ b.length;
    for (let i = 0; i < b.length; i++) {
      result |= a.charCodeAt(i % (a.length || 1)) ^ b.charCodeAt(i);
    }
    return result === 0; // always false when lengths differ, but constant-time
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Track and enforce the per-IP request rate limit; returns true when exceeded.
 */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

/**
 * Drop rate-limit entries whose window has closed.
 *
 * Exported so a test can reset the limiter between cases without waiting out
 * the real five-minute sweep.
 */
export function sweepRateLimits(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}

/**
 * Forget every rate-limit entry. Test-only.
 */
export function resetRateLimits(): void {
  rateLimitMap.clear();
}

/**
 * Start the HTTP server and the rate-limit sweeper.
 *
 * Separated from module load so importing this file has no side effects: no
 * bound port, no timer, no Redis connection. `main.ts` is the entry point that
 * calls this.
 *
 * @returns The listening server.
 */
export function start(): ReturnType<typeof createServer> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handleRequest(req, res);
  });

  setInterval(sweepRateLimits, 300_000).unref();

  server.listen(PORT, () => {
    console.log(`Route tracker listening on port ${PORT}`);
  });

  return server;
}

export { handleRequest };
