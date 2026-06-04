/**
 * Onboarding Flow
 *
 * Multi-step first-launch experience:
 * 1. Welcome + disclaimer
 * 2. Location permission request
 * 3. Region selection + download prompt
 *
 * Minimal steps — user can skip download and do it later.
 */

/* eslint-disable max-lines-per-function -- pre-existing oversized onboarding screen rendering all three step views inline; tracked in docs/tech-debt.md (decompose onboarding screen) */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useState, useCallback } from "react";
import { StyleSheet, View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import { track, Events } from "@/platform/analytics";
import { requestForegroundPermissionsAsync } from "@/platform/location";
import { acceptDisclaimer } from "@/services/AppBootstrap";

type Step = "disclaimer" | "location" | "ready";

/** First-launch onboarding: disclaimer, location permission, and ready steps. */
export default function OnboardingScreen(): React.JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState<Step>("disclaimer");
  const [locationGranted, setLocationGranted] = useState(false);

  const handleAcceptDisclaimer = useCallback(async () => {
    await acceptDisclaimer();
    setStep("location");
  }, []);

  const handleRequestLocation = useCallback(async () => {
    const { status } = await requestForegroundPermissionsAsync();
    const granted = status === "granted";
    setLocationGranted(granted);
    track(granted ? Events.LOCATION_PERMISSION_GRANTED : Events.LOCATION_PERMISSION_DENIED);
    setStep("ready");
  }, []);

  const handleSkipLocation = useCallback(() => {
    setStep("ready");
  }, []);

  const handleFinish = useCallback(() => {
    track(Events.ONBOARDING_COMPLETED);
    router.replace("/(tabs)");
  }, [router]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress dots */}
      <View style={styles.progress}>
        <View style={[styles.dot, step === "disclaimer" && styles.dotActive]} />
        <View style={[styles.dot, step === "location" && styles.dotActive]} />
        <View style={[styles.dot, step === "ready" && styles.dotActive]} />
      </View>

      {step === "disclaimer" && (
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.centeredContent}
        >
          <Text style={styles.title}>BugRout</Text>
          <Text style={styles.subtitle}>Evacuation-Aware Navigation</Text>

          <View style={styles.disclaimerBox}>
            <FontAwesome
              name="exclamation-triangle"
              size={24}
              color={colors.warning}
            />
            <Text style={styles.disclaimerTitle}>Important Disclaimer</Text>
            <Text style={styles.disclaimerText}>
              BugRout provides advisory routing only. Route suggestions are
              based on statistical models and may not reflect real-time
              conditions.
            </Text>
            <Text style={styles.disclaimerText}>
              Do not rely solely on this app for life-safety decisions. Always
              follow official evacuation orders and use your own judgment.
            </Text>
          </View>

          <Text style={styles.legalHint}>
            By continuing, you agree to our Privacy Policy and Terms of Service.
          </Text>

          <Pressable
            testID="onboarding-accept-btn"
            style={styles.primaryButton}
            onPress={handleAcceptDisclaimer}
            accessibilityLabel="Accept disclaimer and continue"
            accessibilityHint="Acknowledges the advisory-only disclaimer and moves to the location permission step"
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>
              I Understand — Continue
            </Text>
          </Pressable>
        </ScrollView>
      )}

      {step === "location" && (
        <View style={styles.centeredContent}>
          <FontAwesome name="map-marker" size={56} color={colors.accent} />
          <Text style={styles.stepTitle}>Enable Location</Text>
          <Text style={styles.stepDescription}>
            BugRout needs your location to provide turn-by-turn navigation and
            calculate routes from your current position.
          </Text>
          <Text style={styles.privacyNote}>
            Your location is processed on-device only and never sent to our
            servers.
          </Text>

          <Pressable
            style={styles.primaryButton}
            onPress={handleRequestLocation}
            accessibilityLabel="Allow location access"
            accessibilityHint="Opens the system prompt to grant location access for navigation"
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Allow Location</Text>
          </Pressable>

          <Pressable
            style={styles.skipButton}
            onPress={handleSkipLocation}
            accessibilityLabel="Skip location permission for now"
            accessibilityHint="Continues without granting location; you can enable it later in Settings"
            accessibilityRole="button"
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </View>
      )}

      {step === "ready" && (
        <View style={styles.centeredContent}>
          <FontAwesome name="check-circle" size={56} color={colors.accent} />
          <Text style={styles.stepTitle}>You're Ready</Text>
          <Text style={styles.stepDescription}>
            {locationGranted
              ? "Location enabled. For the best experience, download offline maps for your region."
              : "For navigation, you'll need to enable location in Settings. Download offline maps for your region to get started."}
          </Text>

          <View style={styles.featureList}>
            <FeatureItem icon="road" text="Offline turn-by-turn routing" />
            <FeatureItem icon="fire" text="Wildfire & flood avoidance" />
            <FeatureItem icon="tint" text="Fuel & water station finder" />
            <FeatureItem icon="clock-o" text="3 taps from launch to navigation" />
          </View>

          <Pressable
            style={styles.primaryButton}
            onPress={handleFinish}
            accessibilityLabel="Start using BugRout"
            accessibilityHint="Completes onboarding and opens the main map screen"
            accessibilityRole="button"
          >
            <FontAwesome
              name="arrow-right"
              size={16}
              color={colors.background}
            />
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function FeatureItem({
  icon,
  text,
}: {
  icon: string;
  text: string;
}): React.JSX.Element {
  return (
    <View style={styles.featureRow}>
      <FontAwesome
        name={icon as React.ComponentProps<typeof FontAwesome>["name"]}
        size={16}
        color={colors.accent}
        style={styles.featureIcon}
      />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progress: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 24,
  },
  scrollContent: {
    flex: 1,
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  title: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.accent,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },
  disclaimerBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    alignItems: "center",
    gap: spacing.sm,
    width: "100%",
  },
  disclaimerTitle: {
    ...typography.subheading,
    color: colors.warning,
  },
  disclaimerText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
    textAlign: "center",
  },
  legalHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  stepTitle: {
    ...typography.heading,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  stepDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginTop: spacing.md,
    maxWidth: 320,
  },
  privacyNote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: spacing.md,
    maxWidth: 280,
  },
  primaryButton: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
    marginTop: spacing.xl,
    alignSelf: "stretch",
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.background,
  },
  skipButton: {
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  skipText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  featureList: {
    alignSelf: "stretch",
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  featureIcon: {
    width: 24,
    textAlign: "center",
  },
  featureText: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
