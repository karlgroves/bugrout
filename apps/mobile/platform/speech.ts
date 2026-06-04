/**
 * Speech platform abstraction.
 * Silently no-ops in Expo Go.
 */

import { Platform } from "react-native";

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
