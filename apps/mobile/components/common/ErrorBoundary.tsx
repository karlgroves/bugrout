/**
 * Error Boundary Component
 *
 * Catches unhandled errors in child components and shows a
 * recovery UI. Critical for a safety app — never show a blank screen.
 */

import { Component, type ReactNode } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.props.fallbackMessage ??
              "An unexpected error occurred. Your offline data is safe."}
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.errorDetail}>
              {this.state.error.message}
            </Text>
          )}
          <Pressable
            style={styles.retryButton}
            onPress={this.handleRetry}
            accessibilityLabel="Try again"
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  title: {
    ...typography.heading,
    marginBottom: spacing.md,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  errorDetail: {
    ...typography.caption,
    color: colors.danger,
    fontFamily: "monospace",
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    overflow: "hidden",
  },
  retryButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
  },
  retryText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.background,
  },
});
