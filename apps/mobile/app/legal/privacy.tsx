import { StyleSheet, ScrollView, Text } from "react-native";
import { PRIVACY_POLICY } from "@/constants/legal";
import { colors, spacing, typography } from "@/constants/theme";

export default function PrivacyPolicyScreen() {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.text}>{PRIVACY_POLICY.trim()}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  text: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
    paddingBottom: spacing.xxl,
  },
});
