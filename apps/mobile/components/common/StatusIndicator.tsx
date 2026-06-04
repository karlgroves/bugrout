import { StyleSheet, View, Text } from "react-native";

import { colors, spacing } from "@/constants/theme";
import { useConnectivityStore } from "@/stores/useConnectivityStore";

/**
 * Always-visible badge showing whether the device currently has internet
 * connectivity, so the user knows if live data is available.
 */
export function StatusIndicator(): React.JSX.Element {
  const isOnline = useConnectivityStore((s) => s.isOnline);

  return (
    <View
      style={styles.container}
      accessibilityLabel={isOnline ? "Connected to internet" : "Offline mode"}
      accessibilityHint={
        isOnline
          ? "Live threat and resource data is being updated"
          : "Using downloaded maps and cached data; live updates are paused"
      }
      accessibilityRole="text"
    >
      <View style={[styles.dot, isOnline ? styles.online : styles.offline]} />
      <Text style={styles.label}>{isOnline ? "Live" : "Offline"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  online: {
    backgroundColor: colors.online,
  },
  offline: {
    backgroundColor: colors.offline,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});
