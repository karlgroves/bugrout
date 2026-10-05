/**
 * Turn-by-turn directions as a list (#192).
 *
 * The text alternative to the map: every step with its distance and the clock
 * time it will be reached, readable with a screen reader one step at a time,
 * and usable where the map isn't (outside a downloaded region, or on a small
 * or dim screen). During a trip it starts at the step being driven towards and
 * keeps up with progress, so nobody has to scroll.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, spacing, typography } from "@/constants/theme";
import {
  arrivalTimes,
  buildDirections,
  secondsToStep,
} from "@/services/navigation/directions";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { formatDistance } from "@/utils/geo";

import { ManeuverIcon } from "./ManeuverIcon";

import type { DirectionStep } from "@/services/navigation/directions";
import type { Route } from "@bugrout/shared";

/**
 * Props for {@link DirectionsList}.
 */
interface DirectionsListProps {
  route: Route;
  /**
   * During a trip: the step being driven towards, and how far away it is.
   * Omitted on the preview, where the list starts at the beginning.
   */
  progress?: { current: number; metresToCurrent: number } | undefined;
  /** The current time; a prop so tests can fix it. Defaults to now. */
  now?: number | undefined;
}

/** A clock time such as "9:34 AM", in the device's locale. */
function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The words a step is announced with: one item per step for screen readers. */
function stepLabel(
  step: DirectionStep,
  distance: string,
  at: string | null,
  isCurrent: boolean,
): string {
  return [
    isCurrent ? "Next" : null,
    step.isStop ? "Stop" : null,
    step.maneuver.instruction,
    distance === "" ? null : `in ${distance}`,
    at === null ? null : `at ${at}`,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");
}

/**
 * Announce a reroute: the list changes under the user, so say so (#192),
 * visibly and to screen readers.
 */
function useRouteUpdatedNotice(routeId: string): boolean {
  const firstId = useRef(routeId);
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    if (routeId === firstId.current) return;
    firstId.current = routeId;
    setUpdated(true);
    AccessibilityInfo.announceForAccessibility("Route updated");
  }, [routeId]);
  return updated;
}

/**
 * One step: its arrow (or a stop marker), instruction, distance, the clock
 * time it will be reached, and the distance from the start. During a trip the
 * step being driven towards is highlighted and shows the live distance.
 */
function StepRow({
  step,
  metresToCurrent,
  arrivesAt,
  units,
}: {
  step: DirectionStep;
  /** Live distance to this step; set only for the step being driven towards. */
  metresToCurrent: number | undefined;
  arrivesAt: number | null;
  units: "mi" | "km";
}): React.JSX.Element {
  const isCurrent = metresToCurrent !== undefined;
  const metres = metresToCurrent ?? step.distanceFromPrevious;
  const distance = metres > 0 ? formatDistance(metres, units) : "";
  const at = arrivesAt === null ? null : clock(arrivesAt);
  return (
    <View
      style={[styles.row, isCurrent && styles.currentRow]}
      accessible
      accessibilityLabel={stepLabel(step, distance, at, isCurrent)}
      accessibilityHint="One step of the turn-by-turn directions"
      testID={`direction-step-${String(step.index)}`}
    >
      {step.isStop ? (
        <FontAwesome name="map-marker" size={28} color={colors.info} />
      ) : (
        <ManeuverIcon type={step.maneuver.type} size={28} />
      )}
      <View style={styles.text}>
        <Text style={styles.instruction}>{step.maneuver.instruction}</Text>
        <Text style={styles.detail}>
          {[distance, at === null ? "" : `at ${at}`]
            .filter((part) => part !== "")
            .join(" · ")}
        </Text>
        <Text style={styles.total}>
          {formatDistance(step.distanceFromStart, units)} from start
        </Text>
      </View>
    </View>
  );
}

/** The list of steps, from the step being driven towards (or the start). */
export function DirectionsList({
  route,
  progress,
  now = Date.now(),
}: DirectionsListProps): React.JSX.Element {
  const { units } = useSettingsStore();
  const steps = useMemo(() => buildDirections(route), [route]);
  const current = progress?.current ?? 0;
  const routeUpdated = useRouteUpdatedNotice(route.id);
  const times = arrivalTimes(
    steps,
    now,
    current,
    progress ? secondsToStep(steps, current, progress.metresToCurrent) : 0,
  );

  return (
    <View style={styles.container} testID="directions-list">
      {routeUpdated ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          Route updated
        </Text>
      ) : null}
      {current > 0 ? (
        <Text style={styles.passed}>
          {current === 1 ? "1 step done" : `${String(current)} steps done`}
        </Text>
      ) : null}
      <FlatList
        data={steps.slice(current)}
        keyExtractor={(step) => String(step.index)}
        renderItem={({ item: step }) => (
          <StepRow
            step={step}
            metresToCurrent={
              step.index === current ? progress?.metresToCurrent : undefined
            }
            arrivesAt={times[step.index] ?? null}
            units={units}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  notice: {
    ...typography.caption,
    color: colors.info,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  passed: {
    ...typography.caption,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  currentRow: {
    backgroundColor: colors.surfaceElevated,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  text: {
    flex: 1,
  },
  instruction: {
    ...typography.body,
  },
  detail: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  total: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
