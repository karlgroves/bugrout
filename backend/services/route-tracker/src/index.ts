/**
 * Route Tracker — Fly.io + Redis
 *
 * Tracks active route assignments per road segment for load distribution.
 * When online, the app reports which edges its route uses.
 * The routing engine queries density to softly bias away from over-assigned edges.
 *
 * All data expires after 2 hours (active evacuation window).
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import Redis from "ioredis";

const EDGE_TTL = 7200; // 2 hours
const PORT = parseInt(process.env.PORT ?? "8080", 10);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const API_SECRET = process.env.API_SECRET ?? "";
const MAX_BODY_SIZE = 65536; // 64 KB
const MAX_EDGE_IDS = 1000;
const REGION_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const EDGE_ID_PATTERN = /^[a-zA-Z0-9_:-]{1,128}$/;

// Simple in-memory rate limiter: max 120 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const redis = new Redis(REDIS_URL);

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? "unknown";

  // Rate limiting
  if (isRateLimited(clientIp)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Rate limited" }));
    return;
  }

  // CORS — only allow configured origins (or none in production)
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? [];
  const origin = req.headers.origin ?? "";
  const corsOrigin = allowedOrigins.length > 0 && allowedOrigins.includes(origin) ? origin : "";

  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Strict-Transport-Security", "max-age=31536000");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Authenticate all non-health endpoints
  if (req.url !== "/health") {
    if (!API_SECRET) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Service not configured" }));
      return;
    }
    const authHeader = req.headers.authorization ?? "";
    const providedSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!timingSafeEqual(providedSecret, API_SECRET)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  // POST /v1/assignment — report route edge usage
  if (req.method === "POST" && req.url === "/v1/assignment") {
    let body: string;
    try {
      body = await readBody(req, MAX_BODY_SIZE);
    } catch {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload too large" }));
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const { edgeIds, regionId } = parsed as {
      edgeIds: string[];
      regionId: string;
    };

    if (!Array.isArray(edgeIds) || typeof regionId !== "string") {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "edgeIds (array) and regionId (string) required" }));
      return;
    }

    if (!REGION_ID_PATTERN.test(regionId)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid regionId format" }));
      return;
    }

    if (edgeIds.length === 0 || edgeIds.length > MAX_EDGE_IDS) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: `edgeIds must have 1-${MAX_EDGE_IDS} entries` }));
      return;
    }

    for (const edgeId of edgeIds) {
      if (typeof edgeId !== "string" || !EDGE_ID_PATTERN.test(edgeId)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid edgeId format" }));
        return;
      }
    }

    const pipeline = redis.pipeline();
    for (const edgeId of edgeIds) {
      const key = `density:${regionId}:${edgeId}`;
      pipeline.incr(key);
      pipeline.expire(key, EDGE_TTL);
    }
    await pipeline.exec();

    res.writeHead(204);
    res.end();
    return;
  }

  // GET /v1/density/:regionId — get edge assignment counts
  const densityMatch = req.url?.match(/^\/v1\/density\/([a-z][a-z0-9-]{0,63})$/);
  if (req.method === "GET" && densityMatch) {
    const regionId = densityMatch[1];
    const pattern = `density:${regionId}:*`;

    // Use SCAN instead of KEYS to avoid blocking Redis
    const edges: Record<string, number> = {};
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await redis.mget(keys);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (key === undefined) continue;
          const edgeId = key.replace(`density:${regionId}:`, "");
          edges[edgeId] = parseInt(values[i] ?? "0", 10);
        }
      }
    } while (cursor !== "0");

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ edges }));
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
});

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
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
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
      result |= (a.charCodeAt(i % (a.length || 1)) ?? 0) ^ b.charCodeAt(i);
    }
    return result === 0; // always false when lengths differ, but constant-time
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

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

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 300_000);

server.listen(PORT, () => {
  console.log(`Route tracker listening on port ${PORT}`);
});
