/*
 * Shared HTTP helpers for BugRout Cloudflare Workers.
 *
 * CORS and security-header construction lived as near-identical copies in every
 * worker. Centralizing them here keeps the cross-origin policy and security
 * posture consistent and prevents the copies from drifting apart.
 */

/**
 * Baseline security response headers applied by every BugRout worker.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Frame-Options": "DENY",
};

export { SECURITY_HEADERS };

/**
 * Per-worker CORS policy. Only `methods` is required; the optional directives
 * are emitted only when a worker actually needs them.
 */
export interface CorsPolicy {
  /** Value for `Access-Control-Allow-Methods`, e.g. `"GET, POST, OPTIONS"`. */
  methods: string;
  /** Value for `Access-Control-Allow-Headers` when the worker accepts custom request headers. */
  allowHeaders?: string;
  /** Value for `Access-Control-Expose-Headers` when responses surface non-simple headers. */
  exposeHeaders?: string;
  /** Preflight cache lifetime in seconds for `Access-Control-Max-Age`. */
  maxAge?: number;
}

/**
 * The subset of a `Request` this module needs.
 *
 * Declared structurally rather than as the platform `Request` so this package
 * stays free of `@cloudflare/workers-types` — both the Workers `Request` and
 * Node's satisfy it, which also keeps these helpers testable under
 * `node --test`.
 */
export interface CorsRequestLike {
  /** Absolute request URL. */
  url: string;
  /** HTTP method, used to detect a CORS preflight. */
  method: string;
  /** Request headers; only `Origin` is read. */
  headers: { get(name: string): string | null };
}

/**
 * Per-request values every BugRout worker derives before dispatching a route.
 */
export interface WorkerRequestContext {
  /** The parsed request URL. */
  url: URL;
  /** CORS + security headers to attach to every response from this request. */
  headers: Record<string, string>;
  /** True when this is a CORS preflight and the worker should reply immediately. */
  isPreflight: boolean;
}

/**
 * Derive the per-request URL, response headers and preflight flag shared by
 * every worker's `fetch` entry point.
 *
 * Centralizing this keeps one invariant in one place: every response carries
 * both the resolved CORS headers and {@link SECURITY_HEADERS}. A worker that
 * built these inline could silently omit the security headers on some path.
 *
 * Deliberately does not construct the preflight `Response` — that would pull a
 * platform-specific global into this package. Callers do
 * `if (isPreflight) return new Response(null, { headers })`.
 *
 * @param request - The incoming request.
 * @param allowedOrigins - Comma-separated allowlist from the worker's env.
 * @param policy - The worker's CORS policy.
 * @returns The parsed URL, merged response headers, and whether this is a preflight.
 */
export function initWorkerRequest(
  request: CorsRequestLike,
  allowedOrigins: string | undefined,
  policy: CorsPolicy,
): WorkerRequestContext {
  const origin = request.headers.get("Origin") ?? "";
  return {
    url: new URL(request.url),
    headers: {
      ...buildCorsHeaders(origin, allowedOrigins, policy),
      ...SECURITY_HEADERS,
    },
    isPreflight: request.method === "OPTIONS",
  };
}

/**
 * Build CORS response headers for a request, allowing only origins present in
 * the configured allowlist.
 *
 * Fails closed: when no origins are configured, or the request origin is not in
 * the allowlist, `Access-Control-Allow-Origin` is empty and cross-origin
 * requests are denied.
 *
 * @param origin - The request's `Origin` header value (empty string when absent).
 * @param allowedOrigins - Comma-separated allowlist from the worker's env, e.g. `"https://bugrout.app"`.
 * @param policy - The worker's CORS policy (allowed methods plus optional header/cache directives).
 * @returns A header map containing the resolved `Access-Control-*` headers.
 */
export function buildCorsHeaders(
  origin: string,
  allowedOrigins: string | undefined,
  policy: CorsPolicy,
): Record<string, string> {
  const allowed = allowedOrigins
    ? allowedOrigins.split(",").map((o) => o.trim())
    : [];

  // Fail closed: if no origins configured, deny cross-origin requests
  const allowOrigin =
    allowed.length > 0 && allowed.includes(origin) ? origin : "";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": policy.methods,
  };

  if (policy.allowHeaders !== undefined) {
    headers["Access-Control-Allow-Headers"] = policy.allowHeaders;
  }
  if (policy.exposeHeaders !== undefined) {
    headers["Access-Control-Expose-Headers"] = policy.exposeHeaders;
  }
  if (policy.maxAge !== undefined) {
    headers["Access-Control-Max-Age"] = String(policy.maxAge);
  }

  return headers;
}
