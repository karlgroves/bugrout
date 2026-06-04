/**
 * Crypto platform abstraction.
 * Falls back to Math.random UUID in Expo Go.
 */

import { Platform } from "react-native";

/**
 * Generates an RFC 4122 version 4 UUID using Math.random, used when a native
 * crypto source is unavailable.
 */
function fallbackUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Returns a random UUID, preferring expo-crypto and falling back to a
 * Math.random implementation in Expo Go / on web.
 */
export function randomUUID(): string {
  if (Platform.OS === "web") {
    return fallbackUUID();
  }
  try {
    const mod = "expo-crypto";
    const Crypto = require(mod);
    return Crypto.randomUUID();
  } catch {
    // Fallback: simple UUID v4 via Math.random
    return fallbackUUID();
  }
}
