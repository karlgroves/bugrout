import { StyleSheet, ScrollView, Text } from "react-native";

import { TERMS_OF_SERVICE } from "@/constants/legal";
import { colors, spacing, typography } from "@/constants/theme";

/** Renders the bundled terms of service text, available offline. */
export default function TermsOfServiceScreen(): React.JSX.Element {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.text}>{TERMS_OF_SERVICE.trim()}</Text>
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
