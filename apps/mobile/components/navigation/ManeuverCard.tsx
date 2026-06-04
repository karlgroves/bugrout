/**
 * Maneuver Card — shows the next turn-by-turn instruction.
 */

import { StyleSheet, View, Text } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { formatDistance } from "@/utils/geo";

import { ManeuverIcon } from "./ManeuverIcon";

import type { RouteManeuver } from "@bugrout/shared";

/**
 * Props for {@link ManeuverCard}.
 */
interface ManeuverCardProps {
  maneuver: RouteManeuver | null;
  distanceToManeuver: number; // meters
}

/**
 * Top-of-screen card during navigation showing the next maneuver's icon,
 * distance, instruction, and street name.
 */
export function ManeuverCard({
  maneuver,
  distanceToManeuver,
}: ManeuverCardProps): React.JSX.Element {
  const { units } = useSettingsStore();

  if (!maneuver) {
    return (
      <View style={styles.container}>
        <ManeuverIcon type="straight" size={36} />
        <View style={styles.info}>
          <Text style={styles.distance}>--</Text>
          <Text style={styles.street}>Calculating route...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ManeuverIcon type={maneuver.type} size={36} />
      <View style={styles.info}>
        <Text style={styles.distance}>
          {formatDistance(distanceToManeuver, units)}
        </Text>
        <Text style={styles.instruction} numberOfLines={2}>
          {maneuver.instruction}
        </Text>
        {maneuver.streetName ? <Text style={styles.street} numberOfLines={1}>
            {maneuver.streetName}
          </Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  info: {
    flex: 1,
  },
  distance: {
    ...typography.maneuver,
  },
  instruction: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  street: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
