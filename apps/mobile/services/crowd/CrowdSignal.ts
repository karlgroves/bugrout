/**
 * Crowd Signal — Anonymous Telemetry
 *
 * When online and opted in, sends anonymous speed/heading data
 * to help other BugRout users with congestion awareness.
 *
 * Privacy design:
 * - Device token is a UUID from a CSPRNG, rotated every 24 hours
 * - No PII is ever transmitted
 * - Token is stored locally and never linked to any account
 * - Server retains data for max 48 hours
 *
 * The unlinkability guarantee — that a stream of pings cannot be tied back to
 * one device over time — holds ONLY while the token comes from a
 * cryptographically secure source. `Math.random()` is seeded and predictable,
 * so tokens minted from it are correlatable and the guarantee silently
 * evaporates. That is its actual precondition, and it is enforced rather than
 * assumed: `secureRandomUUID()` throws when no CSPRNG is reachable, and this
 * module then turns Crowd Signal OFF for the session instead of transmitting
 * a token it cannot stand behind (#85).
 */

import { getPreference, setPreference } from "@/db/queries/preferences";
import * as Battery from "@/platform/battery";
import { CsprngUnavailableError, secureRandomUUID } from "@/platform/crypto";
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
 * Latched once a token could not be minted securely. Crowd Signal stays off for
 * the rest of the session rather than emitting a correlatable token.
 *
 * This is deliberately a session latch and not a write to `crowdSignalOptIn`:
 * the user's stored preference is theirs, and silently flipping it would
 * outlive the condition that caused it.
 */
let csprngUnavailable = false;

/**
 * Send an anonymous speed/heading telemetry signal.
 * Silently no-ops if:
 * - User hasn't opted in
 * - Device is offline
 * - Rate limit not met (10s between signals)
 * - Battery is below 20%
 * - No CSPRNG is available to mint the device token (permanently, for the session)
 */
export async function sendSignal(
  position: LatLng,
  speed: number,
  heading: number,
): Promise<void> {
  // Crowd Signal is off for this session because no CSPRNG was available.
  if (csprngUnavailable) return;

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

  // Named `acquired` rather than `token` on purpose: eslint's
  // security/detect-possible-timing-attacks fires on any `===` against an
  // identifier that looks like a secret, and this is a null check.
  const acquired = await acquireToken();
  if (acquired === null) return;

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
        token: acquired,
      }),
      signal: AbortSignal.timeout(5000),
    });
    lastSentAt = now;
  } catch {
    // Silently fail — crowd signal is best-effort, never block navigation
  }
}

/**
 * Get the device token, or null when one cannot be obtained.
 *
 * A missing CSPRNG is not a transient failure: it latches Crowd Signal off for
 * the session. Do NOT fall back to a weaker source — a predictable token is
 * worse than no telemetry, because it makes the pings correlatable, which is
 * exactly the property the feature promises not to have.
 */
async function acquireToken(): Promise<string | null> {
  try {
    return await getDeviceToken();
  } catch (error) {
    if (error instanceof CsprngUnavailableError) {
      csprngUnavailable = true;
      console.warn(
        "[CrowdSignal] disabled for this session: no cryptographically secure " +
          "random source is available, so an unlinkable device token cannot be minted.",
      );
      return null;
    }
    // Preference storage failure — best-effort, never block navigation.
    return null;
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

  // Generate new token. Throws CsprngUnavailableError rather than degrading;
  // the caller turns Crowd Signal off instead.
  const newToken = secureRandomUUID();
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
 * True when Crowd Signal has been switched off for this session because no
 * CSPRNG was available. Exposed so the UI can explain the state rather than
 * showing an opt-in that quietly does nothing.
 */
export function isCrowdSignalDisabled(): boolean {
  return csprngUnavailable;
}

/**
 * Force token rotation (for testing or privacy reset).
 *
 * Does not clear the CSPRNG latch: rotation cannot conjure a secure random
 * source, and re-enabling on rotation would just mint the weak token later.
 */
export async function rotateToken(): Promise<void> {
  cachedToken = null;
  cachedTokenExpiry = 0;
  await setPreference("crowd_device_token", "");
  await setPreference("crowd_token_expiry", "0");
}
