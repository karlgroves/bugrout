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
/** Leading hextets the IPv4-mapped and IPv4-compatible forms hold at zero. */
const IPV6_V4_ZERO_HEXTETS = 5;
/** The sixth hextet of an IPv4-mapped address; an IPv4-compatible one has 0. */
const IPV4_MAPPED_MARKER = 0xffff;
/** First hextet of the 32 bits an IPv4-mapped address carries. */
const IPV6_V4_HEXTET = 6;
/** Octets in an IPv4 address. */
const IPV4_OCTETS = 4;
const OCTET_BITS = 8;
const OCTET_VALUES = 256;
const OCTET_MASK = 0xff;
const MAX_OCTET = 255;
const MAX_HEXTET = 0xffff;
const HEXTET_VALUES = 0x10000;

/**
 * Fold a trailing dotted quad into the two hextets it stands for.
 *
 * `::ffff:198.51.100.40` and `::ffff:c633:6428` are one address written two
 * ways, and a key that told them apart would let a caller hold two windows.
 *
 * @param bare - An address without a zone.
 * @returns The address with no dotted quad, or null when the quad is not one.
 */
function foldDottedQuad(bare: string): string | null {
  const cut = bare.lastIndexOf(":") + 1;
  const quad = bare.slice(cut);
  if (!quad.includes(".")) return bare;
  const octets = quad.split(".").map((octet) => Number(octet));
  if (octets.length !== IPV4_OCTETS) return null;
  if (
    octets.some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > MAX_OCTET,
    )
  ) {
    return null;
  }
  const value = octets.reduce((acc, octet) => acc * OCTET_VALUES + octet, 0);
  const high = Math.floor(value / HEXTET_VALUES);
  const low = value % HEXTET_VALUES;
  return `${bare.slice(0, cut)}${high.toString(16)}:${low.toString(16)}`;
}

/**
 * Split a colon-separated run of hextets, treating an empty run as none.
 *
 * @param run - The text on one side of a `::`, or a whole address.
 * @returns The hextets it holds.
 */
function splitHextets(run: string): string[] {
  return run === "" ? [] : run.split(":");
}

/**
 * Parse hextet text to hextet values.
 *
 * @param parts - The eight hextets of an address.
 * @returns Their values, or null when one of them is not a hextet.
 */
function parseHextets(parts: string[]): number[] | null {
  const hextets = parts.map((hextet) => parseInt(hextet, 16));
  const wellFormed = hextets.every(
    (hextet) => Number.isInteger(hextet) && hextet >= 0 && hextet <= MAX_HEXTET,
  );
  return wellFormed ? hextets : null;
}

/**
 * Expand an IPv6 address to its eight hextet values, restoring a `::` run of
 * zeros and folding a dotted quad.
 *
 * The hextets are numbers on purpose: parsing normalises leading zeros, case
 * and the dotted-quad spelling, so every way of writing one address reaches
 * one key.
 *
 * @param bare - An address already accepted by {@link isIPv6}, without a zone.
 * @returns The eight hextet values, or null when the text is not one address.
 */
function expandIPv6(bare: string): number[] | null {
  const folded = foldDottedQuad(bare);
  if (folded === null) return null;
  const [head = "", tail, ...extra] = folded.split("::");
  if (extra.length > 0) return null;
  const headParts = splitHextets(head);
  if (tail === undefined) {
    return headParts.length === IPV6_HEXTETS ? parseHextets(headParts) : null;
  }
  const tailParts = splitHextets(tail);
  const elided = IPV6_HEXTETS - headParts.length - tailParts.length;
  if (elided < 0) return null;
  return parseHextets([
    ...headParts,
    ...Array<string>(elided).fill("0"),
    ...tailParts,
  ]);
}

/**
 * The IPv4 address an IPv4-mapped or IPv4-compatible address carries.
 *
 * @param hextets - The eight hextets of the address.
 * @returns The low 32 bits in dotted-quad form.
 */
function embeddedIPv4(hextets: number[]): string {
  return hextets
    .slice(IPV6_V4_HEXTET)
    .flatMap((hextet) => [hextet >>> OCTET_BITS, hextet & OCTET_MASK])
    .join(".");
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
 * on the IPv4 address it carries instead: its top 64 bits are all zero, so
 * grouping it by /64 would collapse every IPv4 caller — which is what Node
 * reports for an IPv4 peer on a dual-stack socket — into one shared window.
 * That decision is made on the expanded hextets, not on the text: the same
 * address written `::ffff:c633:6428` has no dotted quad to recognise, and a
 * caller must not be able to pick its bucket by how it spells its address.
 *
 * Keys from the two paths are prefixed so they cannot meet. An address the
 * limiter cannot parse is counted as it arrived, and `net64:2001:db8:0:0` is
 * then not something a caller can present as its own address.
 *
 * @param address - The resolved client address, with an optional `%zone`.
 * @returns The limiter key.
 */
function rateLimitKey(address: string): string {
  const bare = address.split("%")[0]?.trim() ?? "";
  if (!isIPv6(bare)) return `addr:${bare === "" ? address : bare}`;

  const hextets = expandIPv6(bare);
  if (hextets === null) return `addr:${bare}`;

  const [marker] = hextets.slice(IPV6_V4_ZERO_HEXTETS);
  const topIsZero = hextets
    .slice(0, IPV6_V4_ZERO_HEXTETS)
    .every((hextet) => hextet === 0);
  if (topIsZero && (marker === IPV4_MAPPED_MARKER || marker === 0)) {
    return `addr:${embeddedIPv4(hextets)}`;
  }

  const prefix = hextets
    .slice(0, IPV6_PREFIX_HEXTETS)
    .map((hextet) => hextet.toString(16))
    .join(":");
  return `net64:${prefix}`;
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
