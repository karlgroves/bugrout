/**
 * Fuel Range Warning Banner
 *
 * Spec §7.3: "When estimated remaining range approaches next fuel stop, a
 * non-intrusive banner surfaces."
 *
 * Non-intrusive is the whole point, so this is a banner and not an alert: it
 * is announced once, politely, and never takes focus away from the maneuver
 * the driver is following (#203).
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import { formatDistance } from "@/utils/geo";

import type { FuelStopAhead } from "@/services/navigation/FuelRange";

/**
 * Props for {@link FuelRangeWarning}.
 */
interface FuelRangeWarningProps {
  /** The next station ahead, or `null` when there is none to point at. */
  stop: FuelStopAhead | null;
  /** Metres of range left, or `null` when the driver gave no range. */
  rangeRemaining: number | null;
  /** Whether the threshold has been crossed. */
  warn: boolean;
  /** Whether this station is already a stop on the route. */
  stopAdded: boolean;
  /** Preferred units, from settings. */
  units: "mi" | "km";
  /** Reroute through the station. */
  onAddFuelStop: () => void;
}

/**
 * Banner warning that the range left is close to the distance to the next
 * fuel station on the route, with a one-tap reroute through it.
 *
 * Renders nothing unless a range was given, a station is ahead, and the
 * threshold has been crossed.
 */
export function FuelRangeWarning({
  stop,
  rangeRemaining,
  warn,
  stopAdded,
  units,
  onAddFuelStop,
}: FuelRangeWarningProps): React.JSX.Element | null {
  const showing = warn && stop !== null && rangeRemaining !== null;
  const announced = useRef(false);

  const toStop = stop ? formatDistance(stop.distanceAhead, units) : "";
  const left =
    rangeRemaining === null ? "" : formatDistance(rangeRemaining, units);
  const message = showing
    ? `Fuel: ${stopAdded ? "stop added" : "next station on route"} in ${toStop} — about ${left} of range left`
    : "";

  // Announced once per crossing, not on every GPS tick. announceForAccessibility
  // speaks without moving the screen reader's cursor, which is what keeps the
  // banner non-intrusive; the live region covers Android.
  useEffect(() => {
    if (!showing) {
      announced.current = false;
      return;
    }
    if (announced.current) return;
    announced.current = true;
    AccessibilityInfo.announceForAccessibility(message);
  }, [showing, message]);

  if (!showing) return null;

  return (
    <View
      testID="fuel-range-warning"
      style={styles.container}
      accessibilityLiveRegion="polite"
    >
      <FontAwesome name="tint" size={16} color={colors.warning} />
      <Text style={styles.text}>{message}</Text>
      {/* Once the station is a stop on the route there is nothing left to add,
          so the driver is told where it is rather than offered it again. */}
      {stopAdded ? null : (
        <Pressable
          testID="fuel-range-add-stop-btn"
          style={styles.action}
          onPress={onAddFuelStop}
          accessibilityLabel="Add fuel stop"
          accessibilityHint={`Reroutes your trip through ${stop.resource.name}`}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>Add fuel stop</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning,
  },
  text: {
    ...typography.caption,
    color: colors.warning,
    flex: 1,
  },
  action: {
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  actionText: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.warning,
  },
});
