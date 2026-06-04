/**
 * Loading Overlay
 *
 * Semi-transparent overlay with activity indicator.
 * Used during route calculation and initial data loading.
 */

import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import { colors, spacing, typography } from "@/constants/theme";

interface LoadingOverlayProps {
  message?: string;
  visible: boolean;
}

export function LoadingOverlay({
  message = "Loading...",
  visible,
}: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.container} accessibilityLabel={message}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    zIndex: 100,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.md,
    minWidth: 200,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
