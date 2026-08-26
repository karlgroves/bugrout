/**
 * Crash Reporting via Sentry
 *
 * Captures unhandled errors and key navigation breadcrumbs.
 *
 * Location data is redacted before it leaves the device: every value handed to
 * Sentry passes through {@link redactSensitive}, and `sendDefaultPii` is off.
 * This module previously carried a flat "No PII is transmitted" claim with
 * nothing enforcing it — `setContext` accepted an arbitrary
 * `Record<string, unknown>` from any caller and forwarded it verbatim. For an
 * evacuation app the destination coordinate is the most sensitive value it
 * holds, so the claim now has a mechanism behind it rather than a comment.
 *
 * Redaction is by key name and is deliberately broad. It is a backstop, not a
 * licence to pass coordinates in: callers should still hand over only what they
 * need reported.
 */

import * as Sentry from "@/platform/sentry";

// Set in environment or app config; placeholder string until provisioned.
const SENTRY_DSN: string =
  process.env.EXPO_PUBLIC_SENTRY_DSN ?? "YOUR_SENTRY_DSN";

/** Replacement written in place of a redacted value. */
const REDACTED = "[redacted]";

/** Maximum depth {@link redactSensitive} will walk before refusing to recurse. */
const MAX_REDACT_DEPTH = 6;

/**
 * Key names whose values must never reach Sentry.
 *
 * Matched case-insensitively as substrings, so `destLat`, `origin_latitude`
 * and `homeAddress` are all caught. Substring matching over-redacts — `plat`
 * would match `lat` — which is the correct direction for this trade.
 */
const SENSITIVE_KEY_PATTERNS = [
  "lat",
  "lng",
  "lon",
  "coord",
  "address",
  "destination",
  "dest",
  "origin",
  "waypoint",
  "geometry",
  "polyline",
  "position",
  "location",
  "token",
  "email",
  "phone",
  "contact",
] as const;

/**
 * True when a context key names something that must not be transmitted.
 *
 * @param key - The object key being considered.
 * @returns Whether the value under that key should be replaced.
 */
function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Recursively replace sensitive values in a context object.
 *
 * Anything under a {@link isSensitiveKey} key becomes `"[redacted]"` whatever
 * its type, so a nested `{ destination: { lat, lng } }` is removed whole rather
 * than walked into. Beyond {@link MAX_REDACT_DEPTH} the whole subtree is
 * replaced — an object too deep to inspect is an object we cannot vouch for.
 *
 * @param value - The value to sanitize.
 * @param depth - Current recursion depth; callers pass nothing.
 * @returns A structurally similar value with sensitive fields replaced.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > MAX_REDACT_DEPTH) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key)
      ? REDACTED
      : redactSensitive(inner, depth + 1);
  }
  return out;
}

/**
 * Scrub a Sentry event immediately before transmission.
 *
 * The last line of defence: it runs on every event regardless of which code
 * path produced it, including events Sentry generates itself rather than ones
 * this module passes in.
 *
 * @param event - The outbound Sentry event.
 * @returns The same event with `contexts`, `extra` and `request` sanitized.
 */
export function scrubEvent(
  event: Record<string, unknown>,
): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = { ...event };
  for (const field of ["contexts", "extra", "tags", "request", "user"]) {
    if (field in scrubbed) {
      scrubbed[field] = redactSensitive(scrubbed[field]);
    }
  }
  return scrubbed;
}

/**
 * Initialize Sentry crash reporting.
 *
 * Call once during app bootstrap, **after** settings have been loaded — the
 * opt-in has to be read from storage before this can be decided.
 *
 * The bundled privacy policy says crash reports are sent only with the user's
 * consent. Until now the only gate was whether a DSN had been provisioned, so
 * the consent the policy described did not exist: the moment a DSN was
 * configured, Sentry would have initialised for every user with automatic
 * session tracking on.
 *
 * Both conditions are required, and the opt-in defaults to off.
 *
 * @param optIn - Whether the user has agreed to send crash reports.
 */
export function initCrashReporting(optIn: boolean): void {
  if (!optIn) {
    // No consent — nothing is initialised, so nothing can be sent.
    return;
  }
  if (SENTRY_DSN === "YOUR_SENTRY_DSN") {
    // DSN not configured — skip initialization
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    tracesSampleRate: 0.1,
    // Sentry attaches IP address and user identifiers by default.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}

/**
 * Add a navigation breadcrumb (no coordinates).
 */
export function addNavigationBreadcrumb(
  action: string,
  data?: Record<string, string | number | boolean>,
): void {
  Sentry.addBreadcrumb({
    category: "navigation",
    message: action,
    data: data === undefined ? undefined : redactSensitive(data),
    level: "info",
  });
}

/**
 * Add an error breadcrumb.
 */
export function addErrorBreadcrumb(
  message: string,
  data?: Record<string, string | number | boolean>,
): void {
  Sentry.addBreadcrumb({
    category: "error",
    message,
    data: data === undefined ? undefined : redactSensitive(data),
    level: "error",
  });
}

/**
 * Capture a non-fatal error.
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (context) {
    Sentry.setContext(
      "app_state",
      redactSensitive(context) as Record<string, unknown>,
    );
  }
  Sentry.captureException(error);
}

/**
 * Set user context (anonymous — region only, no PII).
 */
export function setRegionContext(regionId: string): void {
  Sentry.setTag("region", regionId);
}
