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
