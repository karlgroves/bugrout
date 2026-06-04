/**
 * Tile Server — Cloudflare Worker + R2
 *
 * Serves offline map tile packages (PMTiles + Valhalla tiles) from R2 storage.
 * Supports HTTP Range requests for resumable downloads.
 *
 * Security:
 * - API key validation via Authorization header for downloads (manifest is public)
 * - Constant-time key comparison
 * - ETag/If-None-Match caching
 * - Content-Range headers for proper resume support
 * - Configurable CORS origins
 */

/**
 * Cloudflare Worker bindings available to the tile-server worker.
 */
interface Env {
  TILES_BUCKET: R2Bucket;
  API_KEY?: string; // If set, downloads require Authorization: Bearer <key>
  ALLOWED_ORIGINS?: string; // Comma-separated allowed origins
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

    // Health check
    if (url.pathname === "/health") {
      return new Response("ok", { headers });
    }

    // GET /v1/tiles/manifest — always public
    if (url.pathname === "/v1/tiles/manifest") {
      return getManifest(env, headers);
    }

    // GET /v1/tiles/:regionId/:type — key-protected
    const tileMatch =
      /^\/v1\/tiles\/([a-z-]+)\/(pmtiles|valhalla|flood|resources)$/.exec(
        url.pathname,
      );
    if (tileMatch) {
      return handleTileRequest(request, env, tileMatch, headers);
    }

    return new Response("Not Found", { status: 404, headers });
  },
};

/**
 * Validate the API key (if configured) and dispatch to the tile-package handler.
 */
async function handleTileRequest(
  request: Request,
  env: Env,
  tileMatch: RegExpExecArray,
  headers: Record<string, string>,
): Promise<Response> {
  // Validate API key if configured
  if (env.API_KEY) {
    const authHeader = request.headers.get("Authorization") ?? "";
    const providedKey = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";
    const isValid = await timingSafeEqual(providedKey, env.API_KEY);
    if (!isValid) {
      return Response.json(
        { error: "Invalid or missing API key" },
        { status: 401, headers },
      );
    }
  }

  const [, regionId, type] = tileMatch;
  if (!regionId || !type) {
    return new Response("Not Found", { status: 404, headers });
  }
  return getTilePackage(request, env, { regionId, type }, headers);
}

/**
 * Build CORS headers, allowing only origins present in the configured allowlist.
 */
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
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, If-None-Match, Authorization",
    "Access-Control-Expose-Headers":
      "Content-Range, Accept-Ranges, Content-Length, ETag",
  };
}

/**
 * Constant-time string comparison using crypto.subtle.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);

  // Pad to same length to avoid leaking length via timing
  const maxLen = Math.max(aBuf.length, bBuf.length, 1);
  const aPadded = new Uint8Array(maxLen);
  const bPadded = new Uint8Array(maxLen);
  aPadded.set(aBuf);
  bPadded.set(bBuf);

  const aKey = await crypto.subtle.importKey(
    "raw",
    aPadded,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bKey = await crypto.subtle.importKey(
    "raw",
    bPadded,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const aSign = await crypto.subtle.sign("HMAC", aKey, new Uint8Array(0));
  const bSign = await crypto.subtle.sign("HMAC", bKey, new Uint8Array(0));

  // Lengths must also match for a true comparison
  if (aBuf.length !== bBuf.length) return false;

  const aArr = new Uint8Array(aSign);
  const bArr = new Uint8Array(bSign);
  let result = 0;
  for (let i = 0; i < aArr.length; i++) {
    result |= (aArr[i] ?? 0) ^ (bArr[i] ?? 0);
  }
  return result === 0;
}

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
    resources: `${regionId}.fuel.json`,
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
  if (type === "resources") return "application/json";
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
