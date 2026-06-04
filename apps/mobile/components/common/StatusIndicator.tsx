import { StyleSheet, View, Text } from "react-native";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { colors, spacing } from "@/constants/theme";

export function StatusIndicator() {
  const isOnline = useConnectivityStore((s) => s.isOnline);

  return (
    <View
      style={styles.container}
      accessibilityLabel={isOnline ? "Connected to internet" : "Offline mode"}
      accessibilityRole="text"
    >
      <View
        style={[styles.dot, isOnline ? styles.online : styles.offline]}
      />
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
