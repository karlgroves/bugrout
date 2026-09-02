/**
 * First-Launch Download Guide
 *
 * Full-screen overlay shown on the map screen when no offline tiles
 * are downloaded. Auto-detects the user's region via GPS and suggests
 * the most relevant download.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";

import { FeatureRow } from "@/components/common/FeatureRow";
import { findRegionForPoint } from "@/constants/regions";
import { buttons, colors, spacing, typography } from "@/constants/theme";
import { useLocation } from "@/hooks/useLocation";

/**
 * Props for {@link DownloadGuide}.
 */
interface DownloadGuideProps {
  onDismiss: () => void;
}

/**
 * First-launch overlay prompting the user to download offline maps for the
 * region detected from their current location.
 */
export function DownloadGuide({
  onDismiss,
}: DownloadGuideProps): React.JSX.Element {
  const router = useRouter();
  const { position } = useLocation(false);
  const [suggestedRegion, setSuggestedRegion] = useState<string | null>(null);

  // Auto-detect region from GPS
  useEffect(() => {
    if (position) {
      const region = findRegionForPoint(position.lat, position.lng);
      if (region) {
        setSuggestedRegion(region.name);
      }
    }
  }, [position]);

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <FontAwesome name="download" size={40} color={colors.accent} />

        <Text style={styles.title}>Download Offline Maps</Text>

        <Text style={styles.description}>
          BugRout works best with offline maps. Download your region now so you
          can navigate even without cell service.
        </Text>

        {suggestedRegion ? (
          <View style={styles.suggestion}>
            <FontAwesome name="map-marker" size={14} color={colors.accent} />
            <Text style={styles.suggestionText}>
              Detected: <Text style={styles.bold}>{suggestedRegion}</Text>
            </Text>
          </View>
        ) : null}

        <View style={styles.features}>
          <FeatureRow icon="road" text="Turn-by-turn routing" />
          <FeatureRow icon="bolt" text="Fuel & water stations" />
          <FeatureRow icon="fire" text="Fire & flood zones" />
        </View>

        <Pressable
          style={styles.downloadButton}
          onPress={() => {
            onDismiss();
            router.push("/downloads");
          }}
          accessibilityLabel={
            suggestedRegion ? `Download ${suggestedRegion}` : "Download Maps"
          }
          accessibilityHint="Opens the download manager to save maps for offline use"
          accessibilityRole="button"
        >
          <FontAwesome name="download" size={16} color={colors.background} />
          <Text style={styles.downloadText}>
            {suggestedRegion ? `Download ${suggestedRegion}` : "Download Maps"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.skipButton}
          onPress={onDismiss}
          testID="download-guide-skip-btn"
          accessibilityLabel="Skip for now"
          accessibilityHint="Dismisses this prompt and continues without downloading maps"
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 20,
    padding: spacing.xl,
    alignItems: "center",
    maxWidth: 360,
    width: "100%",
  },
  title: {
    ...typography.heading,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginTop: spacing.md,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  suggestionText: {
    ...typography.caption,
    color: colors.accent,
  },
  bold: {
    fontWeight: "700",
  },
  features: {
    alignSelf: "stretch",
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  downloadButton: buttons.primary,
  downloadText: buttons.primaryText,
  skipButton: buttons.skip,
  skipText: buttons.skipText,
});
