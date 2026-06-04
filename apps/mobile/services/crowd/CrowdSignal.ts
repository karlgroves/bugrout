/**
 * Crowd Signal — Anonymous Telemetry
 *
 * When online and opted in, sends anonymous speed/heading data
 * to help other BugRout users with congestion awareness.
 *
 * Privacy design:
 * - Device token is a random UUID that rotates every 24 hours
 * - No PII is ever transmitted
 * - Token is stored locally and never linked to any account
 * - Server retains data for max 48 hours
 */

import { getPreference, setPreference } from "@/db/queries/preferences";
import * as Battery from "@/platform/battery";
import * as Crypto from "@/platform/crypto";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

import type { LatLng } from "@bugrout/shared";

const LOW_BATTERY_THRESHOLD = 0.2;

const SIGNAL_ENDPOINT = "https://signal.bugrout.app/v1/signal";
const MIN_INTERVAL_MS = 10000; // Max 1 signal per 10 seconds
const TOKEN_ROTATION_MS = 86400000; // 24 hours

let lastSentAt = 0;
let cachedToken: string | null = null;
let cachedTokenExpiry = 0;

/**
 * Send an anonymous speed/heading telemetry signal.
 * Silently no-ops if:
 * - User hasn't opted in
 * - Device is offline
 * - Rate limit not met (10s between signals)
 * - Battery is below 20%
 */
export async function sendSignal(
  position: LatLng,
  speed: number,
  heading: number,
): Promise<void> {
  // Check opt-in
  if (!useSettingsStore.getState().crowdSignalOptIn) return;

  // Check connectivity
  if (!useConnectivityStore.getState().isOnline) return;

  // Rate limit
  const now = Date.now();
  if (now - lastSentAt < MIN_INTERVAL_MS) return;

  // Check battery — conserve power when low
  try {
    const batteryLevel = await Battery.getBatteryLevelAsync();
    if (batteryLevel >= 0 && batteryLevel < LOW_BATTERY_THRESHOLD) return;
  } catch {
    // Battery API may not be available on all devices — proceed anyway
  }

  const token = await getDeviceToken();

  try {
    await fetch(SIGNAL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: roundCoord(position.lat),
        lng: roundCoord(position.lng),
        speed: Math.round(speed * 10) / 10, // 1 decimal precision
        heading: Math.round(heading),
        ts: now,
        token,
      }),
      signal: AbortSignal.timeout(5000),
    });
    lastSentAt = now;
  } catch {
    // Silently fail — crowd signal is best-effort, never block navigation
  }
}

/**
 * Get or generate a rotating anonymous device token.
 * Rotates every 24 hours. Stored in SQLite preferences.
 */
async function getDeviceToken(): Promise<string> {
  const now = Date.now();

  // Use cached token if still valid
  if (cachedToken && now < cachedTokenExpiry) {
    return cachedToken;
  }

  // Try to load from SQLite
  const storedToken = await getPreference("crowd_device_token");
  const storedExpiry = await getPreference("crowd_token_expiry");
  const expiryTime = storedExpiry ? parseInt(storedExpiry, 10) : 0;

  if (storedToken && now < expiryTime) {
    cachedToken = storedToken;
    cachedTokenExpiry = expiryTime;
    return storedToken;
  }

  // Generate new token
  const newToken = Crypto.randomUUID();
  const newExpiry = now + TOKEN_ROTATION_MS;

  await setPreference("crowd_device_token", newToken);
  await setPreference("crowd_token_expiry", newExpiry.toString());

  cachedToken = newToken;
  cachedTokenExpiry = newExpiry;

  return newToken;
}

/**
 * Round coordinates to ~11m precision (4 decimal places).
 * Reduces precision to enhance anonymity while still being useful for congestion mapping.
 */
function roundCoord(coord: number): number {
  return Math.round(coord * 10000) / 10000;
}

/**
 * Force token rotation (for testing or privacy reset).
 */
export async function rotateToken(): Promise<void> {
  cachedToken = null;
  cachedTokenExpiry = 0;
  await setPreference("crowd_device_token", "");
  await setPreference("crowd_token_expiry", "0");
}
