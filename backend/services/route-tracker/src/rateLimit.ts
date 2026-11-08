/**
 * Per-client rate limiting for route-tracker.
 *
 * In memory, so it resets when the process restarts. The limiter runs before
 * authentication — that ordering is deliberate: it stops an unauthenticated
 * client forcing unbounded constant-time comparison work — so both the key it
 * uses and the memory it holds must be safe against a caller with no
 * credential.
 */

import type { IncomingMessage } from "node:http";

// Simple in-memory rate limiter: max 120 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
/**
 * Most distinct clients the limiter tracks at once. Past this, after dropping
 * closed windows, a client the limiter has not seen is refused rather than
 * tracked: the map must not grow without bound between sweeps.
 */
const RATE_LIMIT_MAX_ENTRIES = 10_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Resolve the client IP the rate limiter keys on.
 *
 * Only values the platform sets are trusted. `Fly-Client-IP` is written by
 * Fly's proxy. Failing that, the RIGHTMOST `X-Forwarded-For` entry is the one
 * the nearest proxy appended; the leftmost — which this used to read — is
 * whatever the client sent, so rotating it gave a fresh rate-limit window per
 * request, with no credential needed since the limiter runs before auth.
 *
 * @param req - The incoming request.
 * @returns The client address, or "unknown".
 */
export function resolveClientIp(req: IncomingMessage): string {
  const flyIp = req.headers["fly-client-ip"]?.toString().trim();
  if (flyIp) return flyIp;
  const forwarded = req.headers["x-forwarded-for"]
    ?.toString()
    .split(",")
    .at(-1)
    ?.trim();
  if (forwarded) return forwarded;
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Track and enforce the per-IP request rate limit; returns true when exceeded.
 */
export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    if (!entry && rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
      sweepRateLimits();
      // Still full: fail closed for a client we cannot track.
      if (rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) return true;
    }
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

/**
 * Drop rate-limit entries whose window has closed.
 *
 * Exported so a test can reset the limiter between cases without waiting out
 * the real five-minute sweep.
 */
export function sweepRateLimits(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}

/**
 * Forget every rate-limit entry. Test-only.
 */
export function resetRateLimits(): void {
  rateLimitMap.clear();
}
