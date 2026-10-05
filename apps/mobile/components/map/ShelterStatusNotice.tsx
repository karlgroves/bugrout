/**
 * How current the shelter layer is (#201).
 *
 * Shelters open and close during an event (spec §10, Data Freshness), and the
 * layer used to be silently empty whenever the feed failed — which looks
 * exactly like "no shelters nearby". This line says which it is: when the
 * shelters shown were fetched, that none are reported open, or that they
 * couldn't be loaded.
 */

import { StyleSheet, Text } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";
import { useResourceStore } from "@/stores/useResourceStore";

/** "9:30 AM" today, or "Oct 3, 9:30 AM" on an earlier day. */
function asOfLabel(ms: number, now: number): string {
  const when = new Date(ms);
  const time = when.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (when.toDateString() === new Date(now).toDateString()) return time;
  const day = when.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day}, ${time}`;
}

/**
 * A shelter's open/closed status and when that was reported, for its detail
 * sheet: shelters open and close during an event, so a status is only as good
 * as its time.
 *
 * @returns E.g. "Open · as of 9:30 AM".
 */
export function shelterDetail(
  shelter: { metadata: Record<string, unknown>; fetchedAt: number },
  now: number,
): string {
  const { status } = shelter.metadata;
  const label =
    typeof status === "string" && status.length > 0
      ? status.charAt(0) + status.slice(1).toLowerCase()
      : "Status unknown";
  return `${label} · as of ${asOfLabel(shelter.fetchedAt, now)}`;
}

/** The message for the shelter layer's current state, or null for none. */
export function shelterStatusMessage(
  status: { asOf: number | null; failed: boolean },
  shelterCount: number,
  now: number,
): string | null {
  const asOf = status.asOf === null ? null : asOfLabel(status.asOf, now);
  if (status.failed) {
    return asOf === null
      ? "Couldn't load shelters"
      : `Couldn't update shelters; showing those as of ${asOf}`;
  }
  if (asOf === null) return null;
  return shelterCount === 0
    ? `No open shelters reported in this area · as of ${asOf}`
    : `Shelters as of ${asOf}`;
}

/** The shelter layer's status line; renders nothing while the layer is off. */
export function ShelterStatusNotice({
  now = Date.now(),
}: {
  now?: number;
}): React.JSX.Element | null {
  const { shelterStatus, resources, visibleTypes } = useResourceStore();
  if (!visibleTypes.has("shelter")) return null;
  const count = resources.filter((r) => r.type === "shelter").length;
  const message = shelterStatusMessage(shelterStatus, count, now);
  if (message === null) return null;
  return (
    <Text
      style={[styles.text, shelterStatus.failed && styles.failed]}
      accessibilityLiveRegion="polite"
      testID="shelter-status"
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  failed: {
    color: colors.warning,
  },
});
