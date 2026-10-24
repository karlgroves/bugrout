/* eslint-disable max-lines-per-function -- pre-existing oversized scenarios screen with inline empty-state and list rendering; tracked in docs/tech-debt.md (decompose scenarios screen) */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View, Text, FlatList, Pressable } from "react-native";

import { withScreenTitle } from "@/components/common/ScreenTitle";
import {
  buttons,
  colors,
  spacing,
  typography,
  touchTarget,
} from "@/constants/theme";
import { getScenarios } from "@/db/queries/scenarios";
import { useScenarioStore } from "@/stores/useScenarioStore";
import { planDestinationLabel } from "@/utils/planLabel";

const MAX_SCENARIOS = 3;

/** Lists saved evacuation plans (max 3) and links to the plan editor. */
function ScenariosScreen(): React.JSX.Element {
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
          <Text
            style={styles.emptyTitle}
            accessibilityRole="header"
            // Level 2: this tab DOES get an h1 from the navigator header
            // ("Plans"), so a level-1 empty-state title put a second h1 on
            // the page. Same mistake #102 caught in the destination picker —
            // react-native-web maps a bare header role to <h1>.
            aria-level={2}
          >
            No Plans Saved
          </Text>
          <Text style={styles.emptyDescription}>
            Pre-configure up to 3 evacuation plans with destinations, preferred
            routes, and resource stops.
          </Text>
          <Pressable
            testID="create-scenario-btn"
            style={styles.addButton}
            onPress={() => {
              router.push("/scenarios/edit");
            }}
            accessibilityLabel="Create Plan"
            accessibilityHint="Opens the editor to configure a new evacuation plan"
            accessibilityRole="button"
          >
            <Text style={styles.addButtonText}>Create Plan</Text>
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
                accessibilityLabel={`Edit plan: ${item.name}`}
                accessibilityHint="Opens the editor to change this plan's destination and stops"
                accessibilityRole="button"
              >
                <View style={styles.scenarioInfo}>
                  <Text style={styles.scenarioName}>{item.name}</Text>
                  <Text style={styles.scenarioDestination} numberOfLines={2}>
                    {planDestinationLabel(item)}
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
              accessibilityLabel="Add Plan"
              accessibilityHint="Opens the editor to configure an additional evacuation plan"
              accessibilityRole="button"
            >
              <FontAwesome name="plus" size={16} color={colors.accent} />
              <Text style={styles.addOutlineText}>Add Plan</Text>
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
  addButtonOutline: buttons.addOutline,
  addOutlineText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: "600",
  },
});

export default withScreenTitle(ScenariosScreen, "Plans");
