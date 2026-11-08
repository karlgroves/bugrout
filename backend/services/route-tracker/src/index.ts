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

import { isRateLimited, resolveClientIp, sweepRateLimits } from "./rateLimit";

export { resetRateLimits, sweepRateLimits } from "./rateLimit";

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

/**
 * Most edges one density response may carry. Edge ids are caller-chosen and
 * never checked against a road network, so the keyspace a region can hold is
 * bounded only by the TTL. Without a cap, one GET builds that whole keyspace
 * into a single object inside a 256 MB machine.
 */
const MAX_DENSITY_EDGES = 10_000;

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
 *
 * Never rejects. A failure anywhere below — a Redis command that rejects
 * because Redis is down, or a bug — becomes a 500 for this request. The
 * server used to discard this promise with `void`, so any rejection was an
 * unhandled rejection, which Node 22 treats as fatal: one Redis blip killed
 * the process and every other in-flight request with it.
 *
 * @param req - The incoming request.
 * @param res - The response to write.
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    await processRequest(req, res);
  } catch (err: unknown) {
    console.error("[route-tracker] request failed:", err);
    if (!res.headersSent) res.writeHead(500, JSON_CONTENT_TYPE);
    if (!res.writableEnded)
      res.end(JSON.stringify({ error: "Internal error" }));
  }
}

/**
 * Rate-limit, CORS, auth, then route dispatch. May reject; see {@link handleRequest}.
 */
async function processRequest(
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

  // Authenticate all non-health endpoints. The exemption is an exact match on
  // the path, so `/health/`, `//health` and `/healthz` are all authenticated.
  const path = requestPath(req);
  if (path !== "/health" && !authenticate(req, res)) {
    return;
  }

  await routeRequest(req, path, res);
}

/**
 * The request target without its query string.
 *
 * `req.url` is the verbatim request target, query included, so comparing it
 * with `===` sent `POST /v1/assignment?x=1` to the 404 — its assignments were
 * silently never recorded — and `GET /health?probe=1` through authentication.
 * Only the query is removed; the path is not normalised, so the auth exemption
 * above still matches exactly one spelling.
 *
 * @param req - The incoming request.
 * @returns The path part of the request target.
 */
function requestPath(req: IncomingMessage): string {
  const url = req.url ?? "/";
  const query = url.indexOf("?");
  return query === -1 ? url : url.slice(0, query);
}

/**
 * Dispatch an authenticated request to the matching endpoint handler.
 */
async function routeRequest(
  req: IncomingMessage,
  path: string,
  res: ServerResponse,
): Promise<void> {
  // POST /v1/assignment — report route edge usage
  if (req.method === "POST" && path === "/v1/assignment") {
    await handleAssignment(req, res);
    return;
  }

  // GET /v1/density/:regionId — get edge assignment counts
  const densityMatch = /^\/v1\/density\/([a-z][a-z0-9-]{0,63})$/.exec(path);
  if (req.method === "GET" && densityMatch) {
    await handleDensity(densityMatch[1] ?? "", res);
    return;
  }

  // Health check
  if (path === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
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
  try {
    await pipeline.exec();
  } catch (err: unknown) {
    redisUnavailable(res, err);
    return;
  }

  res.writeHead(204);
  res.end();
}

/**
 * Answer 503 for a Redis command that rejected.
 *
 * @param res - The response to write.
 * @param err - The rejection, logged server-side only.
 */
function redisUnavailable(res: ServerResponse, err: unknown): void {
  console.error("[route-tracker] redis command failed:", err);
  res.writeHead(503, JSON_CONTENT_TYPE);
  res.end(JSON.stringify({ error: "Service unavailable" }));
}

/**
 * Handle GET /v1/density/:regionId: return per-edge assignment counts.
 *
 * Returns at most {@link MAX_DENSITY_EDGES} edges, with `truncated: true` when
 * the region may hold more.
 */
async function handleDensity(
  regionId: string,
  res: ServerResponse,
): Promise<void> {
  let result: { edges: Record<string, number>; truncated: boolean };
  try {
    result = await readDensity(regionId);
  } catch (err: unknown) {
    redisUnavailable(res, err);
    return;
  }

  res.writeHead(200, JSON_CONTENT_TYPE);
  res.end(JSON.stringify(result));
}

/**
 * Collect up to {@link MAX_DENSITY_EDGES} edge counts for a region.
 *
 * @param regionId - A validated region id.
 * @returns The counts, and whether the region may hold more than were returned.
 */
async function readDensity(
  regionId: string,
): Promise<{ edges: Record<string, number>; truncated: boolean }> {
  const prefix = `density:${regionId}:`;

  // A Map, turned into an object only at the end: Object.fromEntries defines
  // own properties, so an edge id of `__proto__` lands as a key instead of
  // hitting the inherited setter and vanishing.
  const edges = new Map<string, number>();
  let count = 0;
  let truncated = false;
  let cursor = "0";
  // Use SCAN instead of KEYS to avoid blocking Redis
  do {
    const [nextCursor, scanned] = await redisConn().scan(
      cursor,
      "MATCH",
      `${prefix}*`,
      "COUNT",
      200,
    );
    cursor = nextCursor;

    const keys = scanned.slice(0, MAX_DENSITY_EDGES - count);
    if (keys.length < scanned.length) truncated = true;
    if (keys.length > 0) {
      const values = await redisConn().mget(keys);
      keys.forEach((key, i) => {
        edges.set(key.slice(prefix.length), parseInt(values[i] ?? "0", 10));
      });
      count += keys.length;
    }
    if (count >= MAX_DENSITY_EDGES && cursor !== "0") truncated = true;
  } while (cursor !== "0" && !truncated);

  return { edges: Object.fromEntries(edges), truncated };
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
    // handleRequest never rejects; the catch is a last line of defence so a
    // rejection can never become a fatal unhandled rejection.
    handleRequest(req, res).catch((err: unknown) => {
      console.error("[route-tracker] unhandled request failure:", err);
    });
  });

  setInterval(sweepRateLimits, 300_000).unref();

  server.listen(PORT, () => {
    console.log(`Route tracker listening on port ${PORT}`);
  });

  return server;
}

export { handleRequest };
