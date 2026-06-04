/**
 * Reusable Empty State Component
 *
 * Shows an icon, title, message, and optional action button
 * when a screen has no content to display.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, View, Text, Pressable } from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";

/**
 * Props for {@link EmptyState}.
 */
interface EmptyStateProps {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Placeholder shown when a screen has no content, with an icon, title,
 * message, and an optional call-to-action button.
 */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <FontAwesome name={icon} size={48} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? <Pressable
          style={styles.actionButton}
          onPress={onAction}
          accessibilityLabel={actionLabel}
          accessibilityHint="Performs the suggested action to add content to this screen"
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...typography.subheading,
    marginTop: spacing.sm,
  },
  message: {
    ...typography.caption,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  actionButton: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
  },
  actionText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.background,
  },
});
