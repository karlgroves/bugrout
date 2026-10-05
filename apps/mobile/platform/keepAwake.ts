/**
 * Keep-awake platform abstraction.
 * Silently no-ops on web and when expo-keep-awake is unavailable.
 *
 * Spec §7.1: the screen stays on only while navigating, so the only caller is
 * NavigationController, which activates on start and releases on stop and on
 * arrival.
 */

import { Platform } from "react-native";

/**
 * Keeps the screen from auto-locking until {@link deactivate} is called with
 * the same tag; a no-op on web or when expo-keep-awake is unavailable.
 *
 * @param tag - Identifies this hold, so releasing it can't release another.
 */
export async function activate(tag: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const mod = "expo-keep-awake";
    const KeepAwake = require(mod);
    await KeepAwake.activateKeepAwakeAsync(tag);
  } catch {
    // No-op: the screen locks as normal, which is the safe failure.
  }
}

/**
 * Releases the hold taken by {@link activate} with the same tag; a no-op on
 * web, when expo-keep-awake is unavailable, or when no hold is active.
 *
 * @param tag - The tag passed to {@link activate}.
 */
export async function deactivate(tag: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const mod = "expo-keep-awake";
    const KeepAwake = require(mod);
    await KeepAwake.deactivateKeepAwake(tag);
  } catch {
    // No-op
  }
}
