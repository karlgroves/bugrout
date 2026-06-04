/**
 * Advisory Badge
 *
 * Persistent "Advisory Only" indicator shown during navigation.
 * Required by spec for liability management.
 */

import { StyleSheet, View, Text } from "react-native";
import { colors, spacing } from "@/constants/theme";
import { DISCLAIMER_SHORT } from "@/constants/legal";

export function AdvisoryBadge() {
  return (
    <View
      style={styles.container}
      accessibilityLabel={DISCLAIMER_SHORT}
      accessibilityRole="text"
    >
      <Text style={styles.text}>ADVISORY ONLY</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: {
    fontSize: 9,
    fontWeight: "800",
    color: colors.warning,
    letterSpacing: 1,
  },
});
