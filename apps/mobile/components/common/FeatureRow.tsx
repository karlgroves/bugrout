import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, View, Text } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";

/**
 * Props for {@link FeatureRow}.
 */
interface FeatureRowProps {
  /** FontAwesome glyph name, e.g. `"road"`. */
  icon: string;
  /** Label describing the capability. */
  text: string;
}

/**
 * Single icon-and-label row used in feature lists.
 *
 * Shared by the onboarding walkthrough and the first-launch download guide,
 * which advertise overlapping capability lists and previously each carried
 * their own copy of this row.
 */
export function FeatureRow({ icon, text }: FeatureRowProps): React.JSX.Element {
  return (
    <View style={styles.row}>
      <FontAwesome
        name={icon as React.ComponentProps<typeof FontAwesome>["name"]}
        size={16}
        color={colors.accent}
        style={styles.icon}
      />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    width: 24,
    textAlign: "center",
  },
  text: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
