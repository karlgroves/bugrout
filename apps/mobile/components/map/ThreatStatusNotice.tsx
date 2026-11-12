/**
 * Says when threat data couldn't be updated (#288).
 *
 * A failed NWS or fire-perimeter fetch used to look exactly like "no active
 * threats": the map drew no overlay and the route preview showed no warning,
 * so a route built with no fire avoidance read as a confirmed-clear one. The
 * resource layers already tell a failure from an empty layer
 * (LayerStatusNotice); this does the same for threats, on the map and on the
 * route preview, where the user commits to the road.
 */

import { StyleSheet, Text } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";
import { useThreatStore } from "@/stores/useThreatStore";

import type { ThreatSource } from "@bugrout/shared";

/** How each source is named to the user. */
const SOURCE_NAMES: Record<ThreatSource, string> = {
  nws: "weather alerts",
  usfs: "fire perimeters",
  fema: "flood zones",
};

/** Where the notice is shown, which decides its wording. */
type NoticeContext = "map" | "route";

/**
 * The notice for the sources whose last refresh failed.
 *
 * @returns E.g. "Couldn't update fire perimeters; this route may not avoid
 *   current threats", or null when every source is current.
 */
export function threatStatusMessage(
  failedSources: Partial<Record<ThreatSource, boolean>>,
  context: NoticeContext,
): string | null {
  const failed = new Set(
    Object.entries(failedSources).flatMap(([source, isFailed]) =>
      isFailed ? [source] : [],
    ),
  );
  const names = Object.entries(SOURCE_NAMES).flatMap(([source, name]) =>
    failed.has(source) ? [name] : [],
  );
  if (names.length === 0) return null;
  const what = names.join(" and ");
  return context === "route"
    ? `Couldn't update ${what}; this route may not avoid current threats`
    : `Couldn't update ${what}; threats shown may be out of date`;
}

/** The threat-data status line, or nothing while every source is current. */
export function ThreatStatusNotice({
  context,
}: {
  context: NoticeContext;
}): React.JSX.Element | null {
  const failedSources = useThreatStore((s) => s.failedSources);
  const message = threatStatusMessage(failedSources, context);
  if (message === null) return null;
  return (
    <Text
      style={[styles.text, context === "route" && styles.route]}
      accessibilityLiveRegion="polite"
      testID="threat-status"
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    ...typography.caption,
    color: colors.warning,
    textAlign: "center",
    marginTop: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  route: {
    ...typography.body,
    fontWeight: "600",
    textAlign: "left",
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
});
