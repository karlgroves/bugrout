/**
 * Screen-reader announcements that wait their turn (#383).
 *
 * An announcement speaks without moving the screen reader's cursor, so the
 * driver hears it while keeping their place on the screen. That is why the
 * notices use it instead of taking focus.
 *
 * The catch is that a plain `announceForAccessibility` *interrupts* speech in
 * progress on iOS. Two components announcing on one screen will cut each other
 * off mid-sentence, and the navigation screen has two that fire while the
 * vehicle is moving: the reroute notice in `DirectionsList` and the banner in
 * `FuelRangeWarning`. `queue: true` makes an announcement wait for the one
 * being spoken instead.
 *
 * `queue` is iOS-only and ignored on Android, where `accessibilityLiveRegion`
 * already queues. `react-native-web` has no `announceForAccessibilityWithOptions`
 * at all, and calling it there throws and takes the web preview down, so web
 * keeps the plain call — a no-op in practice, since the components' live
 * regions (`aria-live` on react-native-web) do the announcing in a browser.
 *
 * The rule lives in one place so it can be held there: `announce.test.ts` pins
 * what this does, and `announceCallSites.test.ts` fails on any new direct
 * `AccessibilityInfo` announcement elsewhere. Three older components still
 * call it directly and are listed there by name until they move (#383).
 */

import { AccessibilityInfo, Platform } from "react-native";

/**
 * Announce `message` to the screen reader without interrupting what it is
 * already saying.
 *
 * @param message - The text to speak. An empty string is not announced.
 */
export function announcePolitely(message: string): void {
  if (message === "") return;

  if (Platform.OS === "web") {
    AccessibilityInfo.announceForAccessibility(message);
    return;
  }

  AccessibilityInfo.announceForAccessibilityWithOptions(message, {
    queue: true,
  });
}
