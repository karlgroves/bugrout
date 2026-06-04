/**
 * Haptics platform abstraction.
 * Silently no-ops on web and when unavailable.
 */

import { Platform } from "react-native";

/**
 *
 */
export type ImpactStyle = "light" | "medium" | "heavy";

/**
 * Triggers an impact haptic of the given strength; a no-op on web or when
 * expo-haptics is unavailable.
 */
export async function impact(style: ImpactStyle = "medium"): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const mod = "expo-haptics";
    const Haptics = require(mod);
    const styleMap: Record<string, unknown> = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    };
    await Haptics.impactAsync(styleMap[style]);
  } catch {
    // No-op
  }
}

/**
 * Triggers a notification haptic of the given type; a no-op on web or when
 * expo-haptics is unavailable.
 */
export async function notification(
  type: "success" | "warning" | "error" = "success",
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const mod = "expo-haptics";
    const Haptics = require(mod);
    const typeMap: Record<string, unknown> = {
      success: Haptics.NotificationFeedbackType.Success,
      warning: Haptics.NotificationFeedbackType.Warning,
      error: Haptics.NotificationFeedbackType.Error,
    };
    await Haptics.notificationAsync(typeMap[type]);
  } catch {
    // No-op
  }
}

/**
 * Triggers a selection-change haptic; a no-op on web or when expo-haptics is
 * unavailable.
 */
export async function selection(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const mod = "expo-haptics";
    const Haptics = require(mod);
    await Haptics.selectionAsync();
  } catch {
    // No-op
  }
}
