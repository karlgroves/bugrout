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
import { timeoutSignal } from "@/utils/abort";
import { isLowBatteryLevel } from "@/utils/battery";

import type { LatLng } from "@bugrout/shared";

/**
 * Where signals are POSTed.
 *
 * Read from the environment, with the current host as the fallback, for the
 * same reason the tile server and the Valhalla service are
 * (`EXPO_PUBLIC_TILE_SERVER_URL`, `EXPO_PUBLIC_VALHALLA_URL`): the origin is a
 * deployment detail, and this was the only backend origin in the app that
 * could not be set at build time.
 *
 * It matters here because `signal.bugrout.app` has never resolved — NXDOMAIN
 * on 2026-09-30, 2026-10-22 and again on 2026-10-28 — so Crowd Signal reaches
 * nothing even once the worker is deployed (#144). Which host it should name
 * is not settled: a custom domain routed to the worker, or the `workers.dev`
 * origin the tile server uses (#160). This does not decide that; it makes
 * either one an `eas.json` edit instead of a code change and a release.
 */
const SIGNAL_BASE =
  process.env.EXPO_PUBLIC_SIGNAL_URL ?? "https://signal.bugrout.app";
const SIGNAL_ENDPOINT = `${SIGNAL_BASE}/v1/signal`;
const MIN_INTERVAL_MS = 10000; // Max 1 signal per 10 seconds
const TOKEN_ROTATION_MS = 86400000; // 24 hours
/** Cap on the failure backoff: 2^5 x 10 s, a little over five minutes. */
const MAX_BACKOFF_EXPONENT = 5;

/**
 * Earliest time the next send may start.
 *
 * The window is claimed when a send is *attempted*, before any await, not when
 * one succeeds. Navigation calls `sendSignal` on every GPS fix (about 1 Hz)
 * without awaiting it, so a window claimed only on success let every fix through
 * once the endpoint stopped answering: ten times the intended rate, several
 * requests in flight at once, during exactly the outage a mass evacuation
 * causes (#297).
 */
let nextAllowedAt = 0;
/** Consecutive failed sends; each one doubles the wait before the next. */
let consecutiveFailures = 0;
/** True while a POST is outstanding; a second one never starts alongside it. */
let inFlight = false;
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
 * Whether a signal may be sent at all: the user opted in, the position is real
 * — a demo position (#205) is not traffic, and reporting it would put a phantom
 * car into other evacuees' congestion data — and the device is online.
 */
function signalAllowed(): boolean {
  const { crowdSignalOptIn, demoLocation } = useSettingsStore.getState();
  return (
    crowdSignalOptIn &&
    !demoLocation &&
    useConnectivityStore.getState().isOnline
  );
}

/**
 * Send an anonymous speed/heading telemetry signal.
 * Silently no-ops if:
 * - User hasn't opted in
 * - Device is offline
 * - Rate limit not met (10s between signals, longer after failures)
 * - A previous signal is still in flight
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

  if (!signalAllowed()) return;

  // Rate limit. Claim the window and the in-flight slot now, synchronously,
  // so neither concurrent calls nor failed sends can reopen it.
  const now = Date.now();
  if (inFlight || now < nextAllowedAt) return;
  nextAllowedAt = now + MIN_INTERVAL_MS;
  inFlight = true;
  try {
    await attemptSend(position, speed, heading, now);
  } finally {
    inFlight = false;
  }
}

/**
 * Check the battery and token, then POST one signal, recording the outcome
 * for the backoff. Only `sendSignal` calls this, holding the in-flight slot.
 *
 * @param position - Current position; rounded before it leaves the device.
 * @param speed - Speed to report.
 * @param heading - Heading to report.
 * @param now - When the attempt started.
 */
async function attemptSend(
  position: LatLng,
  speed: number,
  heading: number,
  now: number,
): Promise<void> {
  // Check battery — conserve power when low
  try {
    const batteryLevel = await Battery.getBatteryLevelAsync();
    // An unknown level (-1) is not a low one; see utils/battery.
    if (isLowBatteryLevel(batteryLevel)) return;
  } catch {
    // Battery API may not be available on all devices — proceed anyway
  }

  // Named `acquired` rather than `token` on purpose: eslint's
  // security/detect-possible-timing-attacks fires on any `===` against an
  // identifier that looks like a secret, and this is a null check.
  const acquired = await acquireToken();
  if (acquired === null) return;

  try {
    const response = await fetch(SIGNAL_ENDPOINT, {
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
      signal: timeoutSignal(5000),
    });
    // A 5xx or 429 means the service is struggling; back off rather than
    // keep adding load. Anything else is an answer, so the backoff resets.
    if (response.status >= 500 || response.status === 429) {
      recordFailure(now);
    } else {
      consecutiveFailures = 0;
    }
  } catch {
    // Silently fail — crowd signal is best-effort, never block navigation —
    // but back off: a timeout or dropped connection is not a reason to retry
    // sooner than usual.
    recordFailure(now);
  }
}

/**
 * Push the next allowed send out exponentially after a failed attempt.
 *
 * @param startedAt - When the failed attempt began.
 */
function recordFailure(startedAt: number): void {
  consecutiveFailures += 1;
  const exponent = Math.min(consecutiveFailures, MAX_BACKOFF_EXPONENT);
  nextAllowedAt = startedAt + MIN_INTERVAL_MS * 2 ** exponent;
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
