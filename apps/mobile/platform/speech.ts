/**
 * Speech platform abstraction.
 * Silently no-ops in Expo Go.
 */

import { Platform } from "react-native";

/**
 * Speaks the given text aloud via expo-speech, logging to the console as a
 * fallback on web / in Expo Go.
 */
export function speak(
  text: string,
  options?: { language?: string; rate?: number; pitch?: number },
): void {
  if (Platform.OS === "web") {
    console.log("[BugRout Mock TTS]", text);
    return;
  }
  try {
    const mod = "expo-speech";
    const Speech = require(mod);
    Speech.speak(text, options);
  } catch {
    console.log("[BugRout Mock TTS]", text);
  }
}

/**
 * Stops any in-progress speech; a no-op on web / in Expo Go.
 */
export function stop(): void {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = "expo-speech";
    const Speech = require(mod);
    Speech.stop();
  } catch {
    // No-op
  }
}
