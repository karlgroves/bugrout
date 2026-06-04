/**
 * Sentry platform abstraction.
 * Silently no-ops in Expo Go.
 */

import { Platform } from "react-native";

const SENTRY_MODULE = "@sentry/react-native";

/**
 * Initializes Sentry crash reporting when the native module is available;
 * logs and no-ops on web / in Expo Go.
 */
export function init(_options: Record<string, unknown>): void {
  if (Platform.OS === "web") {
    console.log("[BugRout] Sentry not available (web). Crash reporting disabled.");
    return;
  }
  try {
    const mod = SENTRY_MODULE;
    const Sentry = require(mod);
    Sentry.init(_options);
  } catch {
    console.log("[BugRout] Sentry not available (Expo Go). Crash reporting disabled.");
  }
}

/**
 * Records a Sentry breadcrumb; a no-op when Sentry is unavailable.
 */
export function addBreadcrumb(breadcrumb: Record<string, unknown>): void {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = SENTRY_MODULE;
    const Sentry = require(mod);
    Sentry.addBreadcrumb(breadcrumb);
  } catch {
    // No-op
  }
}

/**
 * Reports an exception to Sentry, falling back to console.error when Sentry
 * is unavailable.
 */
export function captureException(error: Error): void {
  if (Platform.OS === "web") {
    console.error("[BugRout] Uncaught error:", error);
    return;
  }
  try {
    const mod = SENTRY_MODULE;
    const Sentry = require(mod);
    Sentry.captureException(error);
  } catch {
    console.error("[BugRout] Uncaught error:", error);
  }
}

/**
 * Attaches a named context object to subsequent Sentry events; a no-op when
 * Sentry is unavailable.
 */
export function setContext(
  name: string,
  context: Record<string, unknown>,
): void {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = SENTRY_MODULE;
    const Sentry = require(mod);
    Sentry.setContext(name, context);
  } catch {
    // No-op
  }
}

/**
 * Sets a Sentry tag on subsequent events; a no-op when Sentry is unavailable.
 */
export function setTag(key: string, value: string): void {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = SENTRY_MODULE;
    const Sentry = require(mod);
    Sentry.setTag(key, value);
  } catch {
    // No-op
  }
}
