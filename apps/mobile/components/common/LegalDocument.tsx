import { StyleSheet, ScrollView, Text } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";

/**
 * Props for {@link LegalDocument}.
 */
interface LegalDocumentProps {
  /** The bundled document body. Rendered verbatim, trimmed of surrounding blank lines. */
  text: string;
}

/**
 * Scrollable reader for a bundled legal document.
 *
 * The privacy policy and terms of service are byte-identical screens apart from
 * which constant they render, and both must stay readable with zero
 * connectivity — the text ships in the bundle rather than being fetched.
 */
export function LegalDocument({ text }: LegalDocumentProps): React.JSX.Element {
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.text}>{text.trim()}</Text>
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
