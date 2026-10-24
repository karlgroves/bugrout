/**
 * Plan Resource Stops
 *
 * The fuel and water stop switches on the plan editor.
 *
 * Lifted out of the editor alongside the destination field, continuing the
 * "decompose plan editor" item in `docs/tech-debt.md`.
 */

import { StyleSheet, View, Text, Switch } from "react-native";

import { colors, spacing, switchColors, typography } from "@/constants/theme";

/**
 * Props for {@link PlanResourceStops}.
 */
interface PlanResourceStopsProps {
  /** Whether the plan routes via a fuel station. */
  fuelStop: boolean;
  /** Set whether the plan routes via a fuel station. */
  onChangeFuelStop: (enabled: boolean) => void;
  /** Whether the plan routes via a water source. */
  waterStop: boolean;
  /** Set whether the plan routes via a water source. */
  onChangeWaterStop: (enabled: boolean) => void;
}

/**
 * The two resource-stop switches, with their section heading.
 */
export function PlanResourceStops({
  fuelStop,
  onChangeFuelStop,
  waterStop,
  onChangeWaterStop,
}: PlanResourceStopsProps): React.JSX.Element {
  return (
    <View>
      <Text style={styles.sectionTitle}>Resource Stops</Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Include fuel stop</Text>
        <Switch
          value={fuelStop}
          onValueChange={onChangeFuelStop}
          accessibilityLabel="Include fuel stop"
          accessibilityHint="Routes this plan via a fuel station"
          trackColor={switchColors.trackColor}
          thumbColor={switchColors.thumbColor}
        />
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Include water stop</Text>
        <Switch
          value={waterStop}
          onValueChange={onChangeWaterStop}
          accessibilityLabel="Include water stop"
          accessibilityHint="Routes this plan via a water source"
          trackColor={switchColors.trackColor}
          thumbColor={switchColors.thumbColor}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  switchLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
