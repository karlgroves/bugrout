/**
 * Tile Server — Cloudflare Worker + R2
 *
 * Serves offline map tile packages (PMTiles, Valhalla, flood, fuel, geocode)
 * from R2 storage. Supports HTTP Range requests for resumable downloads.
 *
 * Access model — public by design (#293, see README.md):
 * - The manifest and every tile package are public. They are derived from
 *   open data (OpenStreetMap, FEMA), and the mobile app sends no credential.
 *   There is deliberately no API-key check: the one that used to be here was
 *   skipped whenever its key was unset, which is every deployment, so it only
 *   made the worker look protected.
 * - Abuse is bounded instead by a per-IP rate limit (Workers Rate Limiting
 *   binding, configured in wrangler.toml) on every route except /health.
 *
 * Also:
 * - ETag/If-None-Match caching
 * - Content-Range headers for proper resume support
 * - Configurable CORS origins
 */

import { initWorkerRequest } from "@bugrout/worker-utils";

/**
 * Cloudflare Worker bindings available to the tile-server worker.
 */
interface Env {
  TILES_BUCKET: R2Bucket;
  /** Per-IP limiter; limit and period live in wrangler.toml `[[ratelimits]]`. */
  RATE_LIMITER: RateLimit;
  ALLOWED_ORIGINS?: string; // Comma-separated allowed origins
}

/** Seconds a rate-limited client is told to wait; matches the 60 s period. */
const RATE_LIMIT_RETRY_AFTER = "60";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { url, headers, isPreflight } = initWorkerRequest(
      request,
      env.ALLOWED_ORIGINS,
      {
        methods: "GET, HEAD, OPTIONS",
        allowHeaders: "Range, If-None-Match",
        exposeHeaders: "Content-Range, Accept-Ranges, Content-Length, ETag",
      },
    );

    if (isPreflight) return new Response(null, { headers });

    // Health check — exempt so uptime probes never trip the limiter.
    if (url.pathname === "/health") {
      return new Response("ok", { headers });
    }

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

    // GET /v1/tiles/manifest
    if (url.pathname === "/v1/tiles/manifest") {
      return getManifest(env, headers);
    }

    // GET /v1/tiles/:regionId/:type — public, like the manifest
    const tileMatch =
      /^\/v1\/tiles\/([a-z-]+)\/(pmtiles|valhalla|flood|fuel|geocode)$/.exec(
        url.pathname,
      );
    const [, regionId, type] = tileMatch ?? [];
    if (regionId && type) {
      return getTilePackage(request, env, { regionId, type }, headers);
    }

    return new Response("Not Found", { status: 404, headers });
  },
};

/**
 * Serve the public tile-package manifest from R2 with caching headers.
 */
async function getManifest(
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  const obj = await env.TILES_BUCKET.get("manifest.json");
  if (!obj) {
    return Response.json({ regions: [] }, { headers });
  }

  return new Response(obj.body, {
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600", // 1hr cache
      ETag: obj.etag,
    },
  });
}

/**
 * Resolve a tile package in R2 and stream it, honoring Range and ETag requests.
 */
async function getTilePackage(
  request: Request,
  env: Env,
  { regionId, type }: { regionId: string; type: string },
  headers: Record<string, string>,
): Promise<Response> {
  const fileMap: Record<string, string> = {
    pmtiles: `${regionId}.pmtiles`,
    valhalla: `${regionId}.valhalla.tar.gz`,
    flood: `${regionId}.flood.geojson`,
    // OSM fuel stations, verified by the app against the manifest (#200).
    fuel: `${regionId}.fuel.json`,
    // On-device destination search index, verified the same way (#208).
    geocode: `${regionId}.geocode.sqlite`,
  };

  const filename = fileMap[type];
  if (!filename) {
    return new Response("Invalid type", { status: 400, headers });
  }

  const key = `${regionId}/${filename}`;

  // Check ETag for conditional requests
  const ifNoneMatch = request.headers.get("If-None-Match");

  // Handle HEAD requests
  const objHead = await env.TILES_BUCKET.head(key);
  if (!objHead) {
    return new Response("Not Found", { status: 404, headers });
  }

  if (ifNoneMatch && ifNoneMatch === objHead.etag) {
    return new Response(null, { status: 304, headers });
  }

  const rangeHeader = request.headers.get("Range");
  const contentType = contentTypeForTile(type);

  if (rangeHeader) {
    const range = parseRange(rangeHeader);
    const obj = await env.TILES_BUCKET.get(key, { range });

    if (!obj) {
      return new Response("Not Found", { status: 404, headers });
    }

    const start = range.offset;
    const end = range.length ? start + range.length - 1 : objHead.size - 1;

    return new Response(obj.body, {
      status: 206,
      headers: {
        ...headers,
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${objHead.size}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        ETag: objHead.etag,
      },
    });
  }

  // Full download
  const obj = await env.TILES_BUCKET.get(key);
  if (!obj) {
    return new Response("Not Found", { status: 404, headers });
  }

  return new Response(obj.body, {
    headers: {
      ...headers,
      "Content-Type": contentType,
      "Content-Length": obj.size.toString(),
      "Accept-Ranges": "bytes",
      ETag: obj.etag,
      "Cache-Control": "public, max-age=86400", // 1 day cache for tiles
    },
  });
}

/**
 * Map a tile package type to the appropriate response Content-Type.
 */
function contentTypeForTile(type: string): string {
  if (type === "flood") return "application/geo+json";
  if (type === "fuel") return "application/json";
  if (type === "geocode") return "application/vnd.sqlite3";
  return "application/octet-stream";
}

/**
 * Parse an HTTP Range header into an R2-compatible offset/length pair.
 */
function parseRange(header: string): { offset: number; length?: number } {
  const match = /bytes=(\d+)-(\d*)/.exec(header);
  if (match?.[1] === undefined) {
    return { offset: 0 };
  }
  const offset = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : undefined;
  if (end !== undefined) {
    return { offset, length: end - offset + 1 };
  }
  return { offset };
}
