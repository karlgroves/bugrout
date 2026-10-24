/**
 * Route Threat Warnings
 *
 * The "route passes near N active threats" box on the route preview, with the
 * first few headlines under it.
 *
 * Lifted out of the preview screen, which `docs/tech-debt.md` records as one
 * to decompose; the screen reads better for it and stays inside the file's
 * line budget.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";

import type { ThreatZone } from "@bugrout/shared";

/** How many headlines are listed under the count. */
const HEADLINES_SHOWN = 3;

/**
 * Props for {@link RouteThreatWarnings}.
 */
interface RouteThreatWarningsProps {
  /** Threat zones the route passes near. */
  threats: ThreatZone[];
}

/**
 * Warning box naming the threats a previewed route passes near.
 *
 * Renders nothing when the route is clear.
 */
export function RouteThreatWarnings({
  threats,
}: RouteThreatWarningsProps): React.JSX.Element | null {
  if (threats.length === 0) return null;

  return (
    <View style={styles.warningBox}>
      <FontAwesome
        name="exclamation-triangle"
        size={16}
        color={colors.warning}
      />
      <View style={styles.warningText}>
        <Text style={styles.warningTitle}>
          Route passes near {threats.length} active threat
          {threats.length > 1 ? "s" : ""}
        </Text>
        {threats.slice(0, HEADLINES_SHOWN).map((t) => (
          <Text key={t.id} style={styles.warningDetail}>
            {t.headline}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  warningBox: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 8,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  warningText: {
    flex: 1,
  },
  warningTitle: {
    ...typography.body,
    fontWeight: "600",
    color: colors.warning,
  },
  warningDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
