/**
 * Analytics platform abstraction (PostHog).
 *
 * Privacy-first:
 * - No PII captured
 * - No location data in events
 * - Respects user opt-out
 * - Web preview no-ops
 */

import { Platform } from "react-native";

let posthog: { capture: (event: string, props?: Record<string, unknown>) => void } | null = null;
let initialized = false;

/**
 * Initialize PostHog analytics.
 * No-ops if the API key isn't configured or on web.
 */
export function initAnalytics(apiKey?: string): void {
  if (Platform.OS === "web" || !apiKey || initialized) return;

  try {
    const mod = "posthog-react-native";
    const PostHog = require(mod);
    posthog = new PostHog.PostHog(apiKey, {
      host: "https://app.posthog.com",
      enableSessionReplay: false,
      captureNativeAppLifecycleEvents: false,
      // Privacy: don't auto-capture anything
      autocapture: false,
    });
    initialized = true;
  } catch {
    // PostHog not installed — no-op
  }
}

/**
 * Track a named event with optional properties.
 * No PII or location data should be in the properties.
 */
export function track(
  event: string,
  properties?: Record<string, string | number | boolean>,
): void {
  posthog?.capture(event, properties);
}

/**
 * Pre-defined event names for consistency.
 */
export const Events = {
  // Navigation
  ROUTE_STARTED: "route_started",
  ROUTE_COMPLETED: "route_completed",
  ROUTE_CANCELLED: "route_cancelled",
  REROUTE_TRIGGERED: "reroute_triggered",
  DEVIATION_DETECTED: "deviation_detected",

  // Scenarios
  SCENARIO_CREATED: "scenario_created",
  SCENARIO_ACTIVATED: "scenario_activated",
  SCENARIO_DELETED: "scenario_deleted",

  // Tiles
  TILE_DOWNLOAD_STARTED: "tile_download_started",
  TILE_DOWNLOAD_COMPLETED: "tile_download_completed",
  TILE_DOWNLOAD_FAILED: "tile_download_failed",
  TILE_DELETED: "tile_deleted",

  // Features
  EMERGENCY_SMS_SENT: "emergency_sms_sent",
  CROWD_SIGNAL_ENABLED: "crowd_signal_enabled",
  CROWD_SIGNAL_DISABLED: "crowd_signal_disabled",

  // Onboarding
  ONBOARDING_COMPLETED: "onboarding_completed",
  DISCLAIMER_ACCEPTED: "disclaimer_accepted",
  LOCATION_PERMISSION_GRANTED: "location_permission_granted",
  LOCATION_PERMISSION_DENIED: "location_permission_denied",
} as const;
