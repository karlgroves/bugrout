/**
 * Crash Reporting via Sentry
 *
 * Captures unhandled errors and key navigation breadcrumbs.
 * No PII is transmitted — only crash traces and app state.
 */

import * as Sentry from "@/platform/sentry";

const SENTRY_DSN = "YOUR_SENTRY_DSN"; // Set in environment or app config

/**
 * Initialize Sentry crash reporting.
 * Call once during app bootstrap.
 */
export function initCrashReporting(): void {
  if (SENTRY_DSN === "YOUR_SENTRY_DSN") {
    // DSN not configured — skip initialization
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30000,
    tracesSampleRate: 0.1,
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
    data,
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
    data,
    level: "error",
  });
}

/**
 * Capture a non-fatal error.
 */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (context) {
    Sentry.setContext("app_state", context);
  }
  Sentry.captureException(error);
}

/**
 * Set user context (anonymous — region only, no PII).
 */
export function setRegionContext(regionId: string): void {
  Sentry.setTag("region", regionId);
}
