/* eslint-disable max-lines-per-function -- pre-existing oversized scenarios screen with inline empty-state and list rendering; tracked in docs/tech-debt.md (decompose scenarios screen) */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View, Text, FlatList, Pressable } from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import { getScenarios } from "@/db/queries/scenarios";
import { useScenarioStore } from "@/stores/useScenarioStore";

const MAX_SCENARIOS = 3;

/** Lists saved evacuation scenarios (max 3) and links to the scenario editor. */
export default function ScenariosScreen(): React.JSX.Element {
  const router = useRouter();
  const { scenarios, setScenarios } = useScenarioStore();

  useEffect(() => {
    getScenarios()
      .then(setScenarios)
      .catch((err: unknown) => {
        console.error("Failed to load scenarios", err);
      });
  }, [setScenarios]);

  return (
    <View style={styles.container}>
      {scenarios.length === 0 ? (
        <View style={styles.emptyState}>
          <FontAwesome name="bookmark-o" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Scenarios Saved</Text>
          <Text style={styles.emptyDescription}>
            Pre-configure up to 3 evacuation scenarios with destinations,
            preferred routes, and resource stops.
          </Text>
          <Pressable
            testID="create-scenario-btn"
            style={styles.addButton}
            onPress={() => {
              router.push("/scenarios/edit");
            }}
            accessibilityLabel="Create new evacuation scenario"
            accessibilityHint="Opens the editor to configure a new evacuation scenario"
            accessibilityRole="button"
          >
            <Text style={styles.addButtonText}>Create Scenario</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            data={scenarios}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                testID={`scenario-card-${item.id}`}
                style={styles.scenarioCard}
                onPress={() => {
                  router.push({
                    pathname: "/scenarios/edit",
                    params: { id: item.id },
                  });
                }}
                accessibilityLabel={`Edit scenario: ${item.name}`}
                accessibilityHint="Opens the editor to change this scenario's destination and stops"
                accessibilityRole="button"
              >
                <View style={styles.scenarioInfo}>
                  <Text style={styles.scenarioName}>{item.name}</Text>
                  <Text style={styles.scenarioDestination}>
                    {item.destination.lat.toFixed(4)},{" "}
                    {item.destination.lng.toFixed(4)}
                  </Text>
                  {item.resourceStops.some((r) => r.enabled) && (
                    <Text style={styles.scenarioStops}>
                      Stops:{" "}
                      {item.resourceStops
                        .filter((r) => r.enabled)
                        .map((r) => r.type)
                        .join(", ")}
                    </Text>
                  )}
                </View>
                <FontAwesome
                  name="chevron-right"
                  size={14}
                  color={colors.textMuted}
                />
              </Pressable>
            )}
          />
          {scenarios.length < MAX_SCENARIOS && (
            <Pressable
              testID="add-scenario-btn"
              style={styles.addButtonOutline}
              onPress={() => {
                router.push("/scenarios/edit");
              }}
              accessibilityLabel="Add another scenario"
              accessibilityHint="Opens the editor to configure an additional evacuation scenario"
              accessibilityRole="button"
            >
              <FontAwesome name="plus" size={16} color={colors.accent} />
              <Text style={styles.addOutlineText}>Add Scenario</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyTitle: {
    ...typography.subheading,
    marginTop: spacing.lg,
  },
  emptyDescription: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  addButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
  },
  addButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.background,
  },
  scenarioCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.sm,
    minHeight: touchTarget.minHeight + 16,
  },
  scenarioInfo: {
    flex: 1,
  },
  scenarioName: {
    ...typography.subheading,
  },
  scenarioDestination: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  scenarioStops: {
    ...typography.caption,
    color: colors.accent,
    marginTop: spacing.xs,
  },
  addButtonOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: "dashed",
    padding: spacing.md,
    minHeight: touchTarget.minHeight,
    marginTop: spacing.md,
  },
  addOutlineText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: "600",
  },
});
