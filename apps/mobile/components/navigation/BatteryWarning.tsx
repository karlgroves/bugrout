/**
 * Battery Warning Banner
 *
 * Non-intrusive banner shown during navigation when battery is low.
 * Spec requirement: "When estimated remaining range approaches next fuel
 * stop, a non-intrusive banner surfaces."
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, View, Text } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";

/**
 * Props for {@link BatteryWarning}.
 */
interface BatteryWarningProps {
  percent: number;
  isCritical: boolean;
}

/**
 * Banner shown during navigation when the device battery is low, warning the
 * user before power loss could interrupt their route guidance.
 */
export function BatteryWarning({
  percent,
  isCritical,
}: BatteryWarningProps): React.JSX.Element {
  return (
    <View
      style={[styles.container, isCritical && styles.critical]}
      accessibilityLabel={`Battery ${percent}% — ${isCritical ? "critically low" : "low"}`}
      accessibilityHint="Consider conserving power or connecting a charger to keep navigation running"
      accessibilityRole="alert"
    >
      <FontAwesome
        name="battery-quarter"
        size={16}
        color={isCritical ? colors.danger : colors.warning}
      />
      <Text style={[styles.text, isCritical && styles.criticalText]}>
        Battery {percent}%{isCritical ? " — Save battery: stop crowd signal" : ""}
      </Text>
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
  critical: {
    borderBottomColor: colors.danger,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  text: {
    ...typography.caption,
    color: colors.warning,
    flex: 1,
  },
  criticalText: {
    color: colors.danger,
  },
});
