/**
 * Route Preview / Confirmation Screen
 *
 * Tap 3 in the 3-tap flow: shows the calculated route on a map with
 * summary info (distance, ETA, warnings) and a confirm button.
 *
 * - Route polyline on map
 * - Distance and estimated duration
 * - Threat warnings if route passes near danger zones
 * - Resource stops included (if scenario activated)
 * - "Go" to start navigation, "Back" to reconfigure
 */

/* eslint-disable max-lines-per-function -- pre-existing oversized route preview screen with inline summary, warnings, and actions; tracked in docs/tech-debt.md (decompose route preview screen) */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { StyleSheet, View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BugroutMap } from "@/components/map/BugroutMap";
import { ThreatOverlay } from "@/components/map/ThreatOverlay";
import { DISCLAIMER_SHORT } from "@/constants/legal";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import { routeIntersectsThreat } from "@/services/routing/ThreatAvoidance";
import { useRouteStore } from "@/stores/useRouteStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useThreatStore } from "@/stores/useThreatStore";
import { formatDistance, formatDuration } from "@/utils/geo";

/** Route confirmation screen showing distance, ETA, threats, and Go/Back actions. */
export default function RoutePreviewScreen(): React.JSX.Element | null {
  const router = useRouter();
  const { activeRoute } = useRouteStore();
  const { threatZones } = useThreatStore();
  const { units } = useSettingsStore();

  // Check for threats along the route
  const threatWarnings = useMemo(() => {
    if (!activeRoute) return [];
    return threatZones.filter((t) =>
      routeIntersectsThreat(activeRoute.coordinates, t),
    );
  }, [activeRoute, threatZones]);

  // Calculate ETA
  const eta = useMemo(() => {
    if (!activeRoute) return "";
    const arrival = new Date(Date.now() + activeRoute.duration * 1000);
    return arrival.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [activeRoute]);

  const handleGo = useCallback(() => {
    if (!activeRoute) return;
    router.replace(`/navigation/${activeRoute.id}`);
  }, [activeRoute, router]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  if (!activeRoute) {
    router.back();
    return null;
  }

  // Count resource waypoints
  const waypointCount =
    activeRoute.legs.length > 1 ? activeRoute.legs.length - 1 : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Map with route preview */}
      <View style={styles.mapContainer}>
        <BugroutMap
          routeCoordinates={activeRoute.coordinates}
          userLocation={activeRoute.coordinates[0]}
        >
          <ThreatOverlay />
        </BugroutMap>
      </View>

      {/* Route info panel */}
      <View style={styles.infoPanel}>
        <ScrollView
          style={styles.infoScroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary row */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {formatDistance(activeRoute.distance, units)}
              </Text>
              <Text style={styles.summaryLabel}>Distance</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {formatDuration(activeRoute.duration)}
              </Text>
              <Text style={styles.summaryLabel}>Duration</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{eta}</Text>
              <Text style={styles.summaryLabel}>ETA</Text>
            </View>
          </View>

          {/* Route name */}
          <Text style={styles.routeSummary}>via {activeRoute.summary}</Text>

          {/* Resource stops */}
          {waypointCount > 0 && (
            <View style={styles.infoRow}>
              <FontAwesome name="map-pin" size={16} color={colors.accent} />
              <Text style={styles.infoText}>
                {waypointCount} resource stop{waypointCount > 1 ? "s" : ""}{" "}
                included
              </Text>
            </View>
          )}

          {/* Threat warnings */}
          {threatWarnings.length > 0 && (
            <View style={styles.warningBox}>
              <FontAwesome
                name="exclamation-triangle"
                size={16}
                color={colors.warning}
              />
              <View style={styles.warningText}>
                <Text style={styles.warningTitle}>
                  Route passes near {threatWarnings.length} active threat
                  {threatWarnings.length > 1 ? "s" : ""}
                </Text>
                {threatWarnings.slice(0, 3).map((t) => (
                  <Text key={t.id} style={styles.warningDetail}>
                    {t.headline}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {/* Advisory disclaimer */}
          <Text style={styles.disclaimer}>{DISCLAIMER_SHORT}</Text>
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Pressable
            testID="route-preview-back-btn"
            style={styles.backButton}
            onPress={handleBack}
            accessibilityLabel="Go back and change destination"
            accessibilityHint="Returns to the destination picker to choose a different destination"
            accessibilityRole="button"
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Pressable
            testID="route-preview-go-btn"
            style={styles.goButton}
            onPress={handleGo}
            accessibilityLabel="Start navigation on this route"
            accessibilityHint="Begins turn-by-turn navigation along the previewed route"
            accessibilityRole="button"
          >
            <FontAwesome
              name="location-arrow"
              size={18}
              color={colors.background}
            />
            <Text style={styles.goText}>Go</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapContainer: {
    flex: 1,
  },
  infoPanel: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    maxHeight: "45%",
  },
  infoScroll: {
    flex: 1,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  routeSummary: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoText: {
    ...typography.body,
    color: colors.accent,
  },
  warningBox: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 8,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  warningText: {
    flex: 1,
  },
  warningTitle: {
    ...typography.body,
    fontWeight: "600",
    color: colors.warning,
  },
  warningDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.lg,
    fontStyle: "italic",
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  backButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
  },
  backText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  goButton: {
    flex: 2,
    flexDirection: "row",
    gap: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.accent,
    padding: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
  },
  goText: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.background,
  },
});
