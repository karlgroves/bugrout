/**
 * Sentry platform abstraction.
 * Silently no-ops in Expo Go.
 */

import { Platform } from "react-native";

export function init(_options: Record<string, unknown>): void {
  if (Platform.OS === "web") {
    console.log("[BugRout] Sentry not available (web). Crash reporting disabled.");
    return;
  }
  try {
    const mod = "@sentry/react-native";
    const Sentry = require(mod);
    Sentry.init(_options);
  } catch {
    console.log("[BugRout] Sentry not available (Expo Go). Crash reporting disabled.");
  }
}

export function addBreadcrumb(breadcrumb: Record<string, unknown>): void {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = "@sentry/react-native";
    const Sentry = require(mod);
    Sentry.addBreadcrumb(breadcrumb);
  } catch {
    // No-op
  }
}

export function captureException(error: Error): void {
  if (Platform.OS === "web") {
    console.error("[BugRout] Uncaught error:", error);
    return;
  }
  try {
    const mod = "@sentry/react-native";
    const Sentry = require(mod);
    Sentry.captureException(error);
  } catch {
    console.error("[BugRout] Uncaught error:", error);
  }
}

export function setContext(
  name: string,
  context: Record<string, unknown>,
): void {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = "@sentry/react-native";
    const Sentry = require(mod);
    Sentry.setContext(name, context);
  } catch {
    // No-op
  }
}

export function setTag(key: string, value: string): void {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = "@sentry/react-native";
    const Sentry = require(mod);
    Sentry.setTag(key, value);
  } catch {
    // No-op
  }
}
