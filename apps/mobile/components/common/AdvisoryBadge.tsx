/**
 * Advisory Badge
 *
 * Persistent "Advisory Only" indicator shown during navigation.
 * Required by spec for liability management.
 */

import { StyleSheet, View, Text } from "react-native";

import { DISCLAIMER_SHORT } from "@/constants/legal";
import { colors, spacing } from "@/constants/theme";

/**
 * Persistent "Advisory Only" badge shown during navigation to remind the
 * user that routing guidance is advisory and not a guarantee of safety.
 */
export function AdvisoryBadge(): React.JSX.Element {
  return (
    <View
      style={styles.container}
      accessibilityLabel={DISCLAIMER_SHORT}
      accessibilityHint="Reminds you that route guidance is advisory only; always use your own judgment"
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
