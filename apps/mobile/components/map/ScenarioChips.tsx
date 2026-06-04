/**
 * Scenario Quick-Activate Chips
 *
 * Displayed above the Bug Out FAB when the user has saved scenarios.
 * Tapping a chip immediately calculates a route using that scenario's
 * destination and preferences — achieving a 2-tap activation path.
 */

import { useState, useCallback } from "react";
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { Scenario, LatLng } from "@bugrout/shared";
import { useScenarioStore } from "@/stores/useScenarioStore";
import { useRouteStore } from "@/stores/useRouteStore";
import { calculateSmartRoute } from "@/services/routing/RouteEngine";
import { getCurrentPosition } from "@/services/location/LocationTracker";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";

export function ScenarioChips() {
  const router = useRouter();
  const { scenarios } = useScenarioStore();
  const { setRoute, setStatus, setDestination } = useRouteStore();
  const [activating, setActivating] = useState<string | null>(null);

  const activateScenario = useCallback(
    async (scenario: Scenario) => {
      setActivating(scenario.id);
      try {
        const loc = await getCurrentPosition();
        const origin = loc.position;

        setStatus("calculating");
        setDestination(scenario.destination);

        const route = await calculateSmartRoute(
          origin,
          scenario.destination,
          scenario.resourceStops,
          scenario.avoidZones.length > 0
            ? { avoidPolygons: scenario.avoidZones }
            : undefined,
        );

        setRoute(route);
        router.push("/route-preview");
      } catch {
        setStatus("error");
      }
      setActivating(null);
    },
    [router, setRoute, setStatus, setDestination],
  );

  if (scenarios.length === 0) return null;

  return (
    <View style={styles.container}>
      {scenarios.map((scenario) => (
        <Pressable
          key={scenario.id}
          style={styles.chip}
          onPress={() => activateScenario(scenario)}
          disabled={activating !== null}
          accessibilityLabel={`Quick activate: ${scenario.name}`}
          accessibilityRole="button"
        >
          {activating === scenario.id ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <>
              <FontAwesome name="bolt" size={12} color={colors.accent} />
              <Text style={styles.chipText} numberOfLines={1}>
                {scenario.name}
              </Text>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.accentMuted,
    minHeight: touchTarget.minHeight - 4,
    minWidth: touchTarget.minWidth,
  },
  chipText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "600",
    maxWidth: 120,
  },
});
