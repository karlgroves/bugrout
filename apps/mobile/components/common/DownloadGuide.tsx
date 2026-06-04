/**
 * First-Launch Download Guide
 *
 * Full-screen overlay shown on the map screen when no offline tiles
 * are downloaded. Auto-detects the user's region via GPS and suggests
 * the most relevant download.
 */

import { useState, useEffect } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useLocation } from "@/hooks/useLocation";
import { findRegionForPoint, DEFAULT_REGIONS } from "@/constants/regions";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";

interface DownloadGuideProps {
  onDismiss: () => void;
}

export function DownloadGuide({ onDismiss }: DownloadGuideProps) {
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
          BugRout works best with offline maps. Download your region now
          so you can navigate even without cell service.
        </Text>

        {suggestedRegion && (
          <View style={styles.suggestion}>
            <FontAwesome name="map-marker" size={14} color={colors.accent} />
            <Text style={styles.suggestionText}>
              Detected: <Text style={styles.bold}>{suggestedRegion}</Text>
            </Text>
          </View>
        )}

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
          accessibilityLabel="Go to offline maps download"
          accessibilityRole="button"
        >
          <FontAwesome name="download" size={16} color={colors.background} />
          <Text style={styles.downloadText}>
            {suggestedRegion
              ? `Download ${suggestedRegion}`
              : "Download Maps"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.skipButton}
          onPress={onDismiss}
          accessibilityLabel="Skip for now"
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FeatureRow({ icon, text }: { icon: string; text: string }) {
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
  downloadButton: {
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
  downloadText: {
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
});
