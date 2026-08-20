/**
 * Crypto platform abstraction.
 *
 * Two generators, deliberately kept apart so a call site cannot pick the wrong
 * one by accident:
 *
 * - `secureRandomUUID()` — cryptographically secure. Used for anything whose
 *   unpredictability is a security or privacy property (device tokens, nonces).
 *   **Throws** when no CSPRNG is reachable; it never degrades quietly.
 * - `unsafeRandomId()` — `Math.random()`. For React keys, local row ids, and
 *   other values where a collision is a cosmetic bug. Never for a token.
 *
 * This split exists because the previous single `randomUUID()` fell back to
 * `Math.random()` on web and on any `expo-crypto` require failure, silently.
 * The Crowd Signal device token is minted here, and its whole purpose is that a
 * stream of location pings cannot be correlated back to one device — a property
 * `Math.random()` does not provide (see #85).
 */

import { Platform } from "react-native";

/** Thrown when no cryptographically secure random source is available. */
export class CsprngUnavailableError extends Error {
  constructor() {
    super(
      "No cryptographically secure random source is available (tried expo-crypto " +
        "and globalThis.crypto). Refusing to mint a security-sensitive value.",
    );
    this.name = "CsprngUnavailableError";
  }
}

/** The subset of the Web Crypto API this module can use. */
interface WebCryptoLike {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
}

/** `globalThis.crypto`, but only if it actually exposes a CSPRNG. */
function webCrypto(): WebCryptoLike | undefined {
  const candidate = (globalThis as { crypto?: WebCryptoLike }).crypto;
  if (!candidate) return undefined;
  const usable =
    typeof candidate.randomUUID === "function" ||
    typeof candidate.getRandomValues === "function";
  return usable ? candidate : undefined;
}

/** Format 16 random bytes as an RFC 4122 version 4 UUID. */
function uuidV4FromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) {
    throw new CsprngUnavailableError();
  }
  // Set the version (4) and variant (RFC 4122) bits. `.at()` / `.set()` rather
  // than indexed access: the repo forbids both `!` and object-injection sinks.
  const versionByte = bytes.at(6);
  const variantByte = bytes.at(8);
  if (versionByte === undefined || variantByte === undefined) {
    throw new CsprngUnavailableError();
  }
  bytes.set([(versionByte & 0x0f) | 0x40], 6);
  bytes.set([(variantByte & 0x3f) | 0x80], 8);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** expo-crypto, or undefined when it is not installed / not linked. */
function expoCrypto():
  | { randomUUID?: () => string; getRandomBytes?: (n: number) => Uint8Array }
  | undefined {
  try {
    // Indirect specifier: keeps the web bundle from statically pulling in the
    // native module, matching the pre-existing behaviour of this file.
    const specifier = "expo-crypto";
    return require(specifier);
  } catch {
    return undefined;
  }
}

/**
 * Returns a random UUID from a cryptographically secure source.
 *
 * Order: `expo-crypto` on native, then the Web Crypto API (which
 * `react-native-get-random-values`, imported in `app/_layout.tsx`, polyfills on
 * React Native).
 *
 * @throws {CsprngUnavailableError} when no secure source is reachable. Callers
 * must treat this as "do not proceed", not as "use something else" — see
 * `services/crowd/CrowdSignal.ts`.
 */
export function secureRandomUUID(): string {
  if (Platform.OS !== "web") {
    const native = expoCrypto();
    if (typeof native?.randomUUID === "function") {
      return native.randomUUID();
    }
    if (typeof native?.getRandomBytes === "function") {
      return uuidV4FromBytes(Uint8Array.from(native.getRandomBytes(16)));
    }
  }

  const web = webCrypto();
  if (typeof web?.randomUUID === "function") {
    return web.randomUUID();
  }
  if (typeof web?.getRandomValues === "function") {
    return uuidV4FromBytes(web.getRandomValues(new Uint8Array(16)));
  }

  throw new CsprngUnavailableError();
}

/**
 * A random-looking id from `Math.random()`.
 *
 * NOT SECURE and never to be used for a token, nonce, session id, or anything
 * whose value an attacker must not be able to predict — `Math.random()` is
 * seeded and predictable. Use `secureRandomUUID()` for those. This exists only
 * for throwaway local identifiers (list keys, in-memory row ids).
 *
 * The `unsafe` prefix is load-bearing: the Semgrep rule
 * `bugrout-no-insecure-random-token` exempts generators named `unsafe*` /
 * `insecure*` and flags every other `Math.random()` in a token/id path. Keep
 * the prefix if you rename this.
 */
export function unsafeRandomId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
