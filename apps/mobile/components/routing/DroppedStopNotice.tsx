/**
 * Says when a resource stop the driver asked for is not on this route (#341).
 *
 * Two of them happen silently today. A fuel station inside an active threat
 * zone is passed over by the corridor search, and if every station in range is
 * inside one, no stop is added at all (#295). And when the second routing pass
 * — the one carrying the stops — fails, the base route is used instead, which
 * drops the stops that were found (#295). Either way the driver sets off
 * believing fuel is on the way.
 *
 * It follows the ThreatStatusNotice pattern (#288): a pure message function
 * and a thin component that reads the store, shown on the route preview, where
 * the driver commits to the road. It announces the way the other notices on
 * this screen do (RouteUnavailableNotice, FuelRangeWarning) rather than by
 * live region alone: accessibilityLiveRegion is Android-only, and iOS
 * VoiceOver does not announce a view just because it appeared, so a notice
 * that is only rendered is a notice a blind driver never gets.
 */

import { useEffect, useRef } from "react";
import { AccessibilityInfo, StyleSheet, Text } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";
import { useRouteStore } from "@/stores/useRouteStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { formatDistance } from "@/utils/geo";

import type { DroppedStop, ResourceType } from "@bugrout/shared";

/** How each kind of stop is named to the driver. */
const STOP_LABELS: Record<ResourceType, string> = {
  fuel: "fuel stop",
  water: "water stop",
  shelter: "shelter stop",
};

/** What the driver can do about it before setting off. */
const STOP_ADVICE: Record<ResourceType, string> = {
  fuel: "Fill up before you set off if you can.",
  water: "Carry what water you can before you set off.",
  shelter: "Check the shelter list before you set off.",
};

/** One line per dropped stop: what is missing, why, and what to do. */
function lineFor(drop: DroppedStop, units: "mi" | "km"): string {
  const label = STOP_LABELS[drop.type];
  const advice = STOP_ADVICE[drop.type];

  if (drop.reason === "in-threat") {
    const where =
      drop.detourMeters === null
        ? ""
        : ` (about ${formatDistance(drop.detourMeters, units)} of extra driving)`;
    const which = drop.name ?? "the nearest one";
    return `No ${label} on this route: the nearest one, ${which}${where}, is inside an active threat zone. ${advice}`;
  }

  if (drop.reason === "routing-failed") {
    const which = drop.name ?? "the stop that was found";
    return `No ${label} on this route: no route could be found through ${which}, so this is the route without it. ${advice}`;
  }

  return `No ${label} on this route: the map data has none within the detour you allowed. ${advice}`;
}

/**
 * The notice for the stops this route left out.
 *
 * @param dropped - The stops the route does not include.
 * @param units - The driver's distance units.
 * @returns One line per dropped stop, or null when the route carries every
 *   stop that was asked for.
 */
export function droppedStopMessage(
  dropped: DroppedStop[],
  units: "mi" | "km",
): string | null {
  if (dropped.length === 0) return null;
  return dropped.map((drop) => lineFor(drop, units)).join("\n\n");
}

/** The dropped-stop notice, or nothing when the route has every stop. */
export function DroppedStopNotice(): React.JSX.Element | null {
  const droppedStops = useRouteStore((s) => s.droppedStops);
  const { units } = useSettingsStore();
  const message = droppedStopMessage(droppedStops, units);
  const announced = useRef<string | null>(null);

  // Announced once per message, not on every render: announceForAccessibility
  // speaks without moving the screen reader's cursor, so the driver hears it
  // while keeping their place on the screen. The live region covers Android.
  useEffect(() => {
    if (message === null) {
      announced.current = null;
      return;
    }
    if (announced.current === message) return;
    announced.current = message;
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  if (message === null) return null;
  return (
    <Text
      style={styles.text}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="dropped-stops"
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    ...typography.body,
    fontWeight: "600",
    color: colors.warning,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.warning,
    overflow: "hidden",
  },
});
