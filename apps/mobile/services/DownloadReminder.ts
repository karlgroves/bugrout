/**
 * The reminder to download offline maps (spec §10, #199).
 *
 * "Users who don't pre-load are unprotected when it matters." Someone who
 * finishes onboarding without downloading a region gets a local notification
 * 24–48 hours later; a completed download cancels it.
 */

import * as Notifications from "@/platform/notifications";

/** Identifies the reminder, so scheduling replaces it and a download cancels it. */
const REMINDER_ID = "bugrout-offline-maps-reminder";

export /** 36 hours: inside the spec's 24–48 h window, whatever the time of day. */
const REMINDER_DELAY_SECONDS = 36 * 60 * 60;

/**
 * Schedule the reminder. Asks for notification permission; if it's refused,
 * nothing is scheduled and the map's download banner remains the prompt.
 *
 * @returns Whether the reminder was scheduled.
 */
export function scheduleDownloadReminder(): Promise<boolean> {
  return Notifications.scheduleOnce(
    REMINDER_ID,
    "Download your offline map",
    "BugRout can't show a map without signal until you download your region. It takes a few minutes on Wi-Fi.",
    REMINDER_DELAY_SECONDS,
  );
}

/** Cancel the reminder; called when a region download completes. */
export function cancelDownloadReminder(): Promise<void> {
  return Notifications.cancel(REMINDER_ID);
}
