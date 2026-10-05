/**
 * Local notifications platform abstraction.
 * Silently no-ops on web and when expo-notifications is unavailable (Expo Go,
 * or a dev build made before it was added), so a missing reminder never
 * breaks the flow that schedules it.
 */

import { Platform } from "react-native";

/** The part of expo-notifications this shim calls. */
interface ExpoNotificationsModule {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  scheduleNotificationAsync: (request: {
    identifier: string;
    content: { title: string; body: string };
    trigger: { type: "timeInterval"; seconds: number; repeats: false };
  }) => Promise<string>;
  cancelScheduledNotificationAsync: (identifier: string) => Promise<void>;
}

/** expo-notifications, or null where it isn't available. */
function load(): ExpoNotificationsModule | null {
  if (Platform.OS === "web") return null;
  try {
    const mod = "expo-notifications";
    return require(mod) as ExpoNotificationsModule;
  } catch {
    return null;
  }
}

/**
 * Schedule a one-off local notification, asking for permission first.
 *
 * @param identifier - Names the notification so it can be replaced or cancelled.
 * @param title - The notification's title.
 * @param body - The notification's text.
 * @param afterSeconds - Delay before it is shown.
 * @returns Whether it was scheduled: false without permission or the module.
 */
export async function scheduleOnce(
  identifier: string,
  title: string,
  body: string,
  afterSeconds: number,
): Promise<boolean> {
  const Notifications = load();
  if (!Notifications) return false;
  try {
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return false;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body },
      trigger: { type: "timeInterval", seconds: afterSeconds, repeats: false },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancel a scheduled notification; a no-op when none is scheduled.
 *
 * @param identifier - The identifier passed to {@link scheduleOnce}.
 */
export async function cancel(identifier: string): Promise<void> {
  const Notifications = load();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch {
    // No-op
  }
}
