/**
 * Route Deviation Banner
 *
 * Shown when the user has deviated >500m from the planned route.
 * Provides a prominent reroute button.
 */

import { StyleSheet, View, Text, Pressable } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";

interface DeviationBannerProps {
  onReroute: () => void;
  onDismiss: () => void;
}

export function DeviationBanner({ onReroute, onDismiss }: DeviationBannerProps) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.content}>
        <FontAwesome name="exclamation-circle" size={20} color={colors.warning} />
        <Text style={styles.text}>You have left the planned route</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={styles.dismissButton}
          onPress={onDismiss}
          accessibilityLabel="Dismiss deviation warning"
          accessibilityRole="button"
        >
          <Text style={styles.dismissText}>Dismiss</Text>
        </Pressable>
        <Pressable
          style={styles.rerouteButton}
          onPress={onReroute}
          accessibilityLabel="Recalculate route from current position"
          accessibilityRole="button"
        >
          <FontAwesome name="refresh" size={14} color={colors.background} />
          <Text style={styles.rerouteText}>Reroute</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderBottomWidth: 2,
    borderBottomColor: colors.warning,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  text: {
    ...typography.body,
    fontWeight: "600",
    color: colors.warning,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dismissButton: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight - 8,
  },
  dismissText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  rerouteButton: {
    flex: 2,
    flexDirection: "row",
    gap: spacing.xs,
    borderRadius: 6,
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight - 8,
  },
  rerouteText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.background,
  },
});
