/**
 * Per-client rate limiting for route-tracker.
 *
 * In memory, so it resets when the process restarts. The limiter runs before
 * authentication — that ordering is deliberate: it stops an unauthenticated
 * client forcing unbounded constant-time comparison work — so both the key it
 * uses and the memory it holds must be safe against a caller with no
 * credential.
 */

import { isIPv6 } from "node:net";

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

/** Hextets in a full IPv6 address. */
const IPV6_HEXTETS = 8;
/** Leading hextets that make up a /64 — the prefix a single client is given. */
const IPV6_PREFIX_HEXTETS = 4;

/**
 * Expand an IPv6 address to its eight hextets, restoring a `::` run of zeros.
 *
 * @param bare - An address already accepted by {@link isIPv6}, without a zone.
 * @returns The eight hextets, or null when the text is not one address.
 */
function expandIPv6(bare: string): string[] | null {
  const [head = "", tail, ...extra] = bare.split("::");
  if (extra.length > 0) return null;
  const headParts = head === "" ? [] : head.split(":");
  if (tail === undefined) {
    return headParts.length === IPV6_HEXTETS ? headParts : null;
  }
  const tailParts = tail === "" ? [] : tail.split(":");
  const elided = IPV6_HEXTETS - headParts.length - tailParts.length;
  if (elided < 0) return null;
  return [...headParts, ...Array<string>(elided).fill("0"), ...tailParts];
}

/**
 * The key the limiter counts an address against.
 *
 * An IPv6 caller is grouped by its /64 — the smallest block a client is
 * normally delegated, so every address in one belongs to the same subscriber.
 * Keying on the whole /128 gave one holder 2^64 free windows: 10,000 of them
 * fill {@link RATE_LIMIT_MAX_ENTRIES}, after which the bound fails closed and
 * every client the limiter has not already seen is refused until the windows
 * close.
 *
 * An IPv4-mapped or IPv4-compatible address (`::ffff:198.51.100.40`) is keyed
 * on its embedded IPv4 address instead: its top 64 bits are all zero, so
 * grouping it by /64 would collapse every IPv4 caller — which is what Node
 * reports for an IPv4 peer on a dual-stack socket — into one shared window.
 *
 * Anything else, IPv4 included, is counted as it arrived.
 *
 * @param address - The resolved client address, with an optional `%zone`.
 * @returns The limiter key.
 */
function rateLimitKey(address: string): string {
  const bare = address.split("%")[0]?.trim() ?? "";
  if (!isIPv6(bare)) return address;

  const embedded = bare.slice(bare.lastIndexOf(":") + 1);
  if (embedded.includes(".")) return embedded;

  const hextets = expandIPv6(bare);
  if (hextets === null) return address;

  // parseInt normalises leading zeros and case, so 2001:0DB8:… and 2001:db8:…
  // land on one key.
  const prefix = hextets
    .slice(0, IPV6_PREFIX_HEXTETS)
    .map((hextet) => parseInt(hextet, 16).toString(16))
    .join(":");
  return `${prefix}::/64`;
}

/**
 * Track and enforce the per-IP request rate limit; returns true when exceeded.
 */
export function isRateLimited(address: string): boolean {
  const now = Date.now();
  const ip = rateLimitKey(address);
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
