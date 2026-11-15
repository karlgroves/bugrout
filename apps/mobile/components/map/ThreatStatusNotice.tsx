/**
 * Says when threat data couldn't be updated (#288).
 *
 * A failed NWS or fire-perimeter fetch used to look exactly like "no active
 * threats": the map drew no overlay and the route preview showed no warning,
 * so a route built with no fire avoidance read as a confirmed-clear one. The
 * resource layers already tell a failure from an empty layer
 * (LayerStatusNotice); this does the same for threats, on the map and on the
 * route preview, where the user commits to the road.
 *
 * The route preview also says when the cached data it checked the route
 * against is older than its refresh interval (#340) — the offline case, where
 * nothing failed because nothing was tried.
 */

import { StyleSheet, Text } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";
import { staleSources } from "@/services/threats/ThreatFreshness";
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

const HOUR_MS = 3_600_000;
/** Ages from this many hours up are given in days. */
const HOURS_SHOWN_AS_DAYS = 48;

/** An age in whole hours, or in whole days from two days up. */
function formatAge(ageMs: number): string {
  const hours = Math.max(1, Math.floor(ageMs / HOUR_MS));
  if (hours >= HOURS_SHOWN_AS_DAYS) return `${Math.floor(hours / 24)} days`;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/**
 * The route-preview notice for sources whose cached data is stale (#340).
 *
 * @returns E.g. "Fire perimeters last updated 3 days ago; this route may not
 *   avoid current threats", or null when no cached source is past its
 *   refresh interval.
 */
export function staleThreatMessage(
  dataAsOf: Partial<Record<ThreatSource, number>>,
  failedSources: Partial<Record<ThreatSource, boolean>>,
  now: number,
): string | null {
  const parts = staleSources(dataAsOf, failedSources, now).map(
    ({ source, ageMs }) =>
      `${SOURCE_NAMES[source]} last updated ${formatAge(ageMs)} ago`,
  );
  if (parts.length === 0) return null;
  const what = parts.join(" and ");
  return `${what.charAt(0).toUpperCase()}${what.slice(1)}; this route may not avoid current threats`;
}

/**
 * The stale-threat-data line on the route preview, or nothing while every
 * cached source is within its refresh interval (#340).
 */
export function StaleThreatNotice(): React.JSX.Element | null {
  const dataAsOf = useThreatStore((s) => s.dataAsOf);
  const failedSources = useThreatStore((s) => s.failedSources);
  const message = staleThreatMessage(dataAsOf, failedSources, Date.now());
  if (message === null) return null;
  return (
    <Text
      style={[styles.text, styles.route]}
      accessibilityLiveRegion="polite"
      testID="threat-stale"
    >
      {message}
    </Text>
  );
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
