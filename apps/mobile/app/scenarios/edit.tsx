/**
 * Plan Editor
 *
 * Create or edit an evacuation plan with:
 * - Name
 * - Destination, as an address or a point dropped on the map
 * - Resource stop preferences (fuel, water with max detour)
 *
 * The destination used to be two raw coordinate fields, with a tip to copy
 * numbers off the map. Nobody knows their relative's house as 39.3138,
 * -76.6021 (#187), so it is an address now — looked up at save time, while the
 * user is calm and online, and stored alongside the coordinates routing needs
 * so the plan still works with no signal at bug-out time.
 *
 * Dropping a pin stays available and needs no lookup at all: some destinations
 * have no address, and the bundled privacy policy promises a way to reach any
 * destination without going through Nominatim.
 */

/* eslint-disable max-lines-per-function, complexity -- pre-existing oversized scenario editor with inline form fields and validation; tracked in docs/tech-debt.md (decompose scenario editor) */
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { v4 as uuidv4 } from "uuid";

import { withScreenTitle } from "@/components/common/ScreenTitle";
import { PlanDestinationField } from "@/components/routing/PlanDestinationField";
import { PlanResourceStops } from "@/components/routing/PlanResourceStops";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import {
  upsertScenario,
  deleteScenario as dbDeleteScenario,
} from "@/db/queries/scenarios";
import { useDestinationEntry } from "@/hooks/useDestinationEntry";
import { track, Events } from "@/platform/analytics";
import { confirmCoverage } from "@/services/routing/coverage";
import { useScenarioStore } from "@/stores/useScenarioStore";
import { pointFromStrings } from "@/utils/geo";

import type { LatLng, Scenario, ResourceStopPreference } from "@bugrout/shared";

/** Editor for creating or updating an evacuation plan and its resource stops. */
function ScenarioEditScreen(): React.JSX.Element {
  const router = useRouter();
  // `lat`/`lng` let a destination be handed straight to a new plan — from a
  // deep link (`bugrout://scenarios/edit?lat=…&lng=…`), which is also the one
  // way the Detox suite can set a *known* destination: its replay server
  // matches recorded endpoints to within 150 m, and neither an address lookup
  // (no answer from a datacenter IP) nor a map tap can hit that.
  const { id, lat, lng } = useLocalSearchParams<{
    id?: string;
    lat?: string;
    lng?: string;
  }>();
  const handedDestination = pointFromStrings(lat, lng);
  const { scenarios, addScenario, updateScenario, deleteScenario } =
    useScenarioStore();

  const existing = id ? scenarios.find((s) => s.id === id) : null;
  const [name, setName] = useState(existing?.name ?? "");

  const destination = useDestinationEntry(
    existing
      ? { point: existing.destination, address: existing.address }
      : handedDestination
        ? { point: handedDestination, address: null }
        : null,
  );
  const { lookingUp, resolve: resolveDestination } = destination;

  const [fuelStop, setFuelStop] = useState(
    existing?.resourceStops.find((r) => r.type === "fuel")?.enabled ?? false,
  );
  const [waterStop, setWaterStop] = useState(
    existing?.resourceStops.find((r) => r.type === "water")?.enabled ?? false,
  );

  /** Save with a destination already resolved; the only path that writes. */
  const save = useCallback(
    async (point: LatLng, savedAddress: string | null) => {
      // Warn now, while there's time to download, not when it's needed (#190).
      // Downloading leaves this editor on the stack, so the unsaved plan is
      // still here to save when the user comes back (#196).
      const choice = await confirmCoverage(point);
      if (choice === "download") router.push("/downloads");
      if (choice !== "save") return;

      const resourceStops: ResourceStopPreference[] = [
        { type: "fuel", maxDetour: 16000, enabled: fuelStop }, // 10 miles
        { type: "water", maxDetour: 16000, enabled: waterStop },
      ];

      const scenario: Scenario = {
        id: existing?.id ?? uuidv4(),
        name: name.trim(),
        destination: point,
        address: savedAddress,
        avoidZones: existing?.avoidZones ?? [],
        resourceStops,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };

      if (existing) {
        updateScenario(scenario.id, scenario);
      } else {
        addScenario(scenario);
      }
      await upsertScenario(scenario);
      track(Events.SCENARIO_CREATED);
      router.back();
    },
    [name, fuelStop, waterStop, existing, addScenario, updateScenario, router],
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Name Required", "Enter a name for this plan.");
      return;
    }

    const dest = await resolveDestination();
    if (dest) await save(dest.point, dest.address);
  }, [name, resolveDestination, save]);

  const handleDelete = useCallback(() => {
    if (!existing) return;
    Alert.alert("Delete Plan", `Delete "${existing.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            deleteScenario(existing.id);
            await dbDeleteScenario(existing.id);
            track(Events.SCENARIO_DELETED);
            router.back();
          })();
        },
      },
    ]);
  }, [existing, deleteScenario, router]);

  return (
    <ScrollView style={styles.container} testID="plan-editor">
      <Text style={styles.label}>Plan Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g., Wildfire East, Grid Down"
        placeholderTextColor={colors.textMuted}
        maxLength={40}
        accessibilityLabel="Plan name"
        accessibilityHint="Enter a short name to identify this evacuation plan"
      />

      <PlanDestinationField
        address={destination.address}
        onChangeAddress={destination.changeAddress}
        resolved={destination.resolved}
        matches={destination.matches}
        onPickMatch={destination.pickMatch}
        onChooseOnMap={() => {
          router.push("/scenarios/pick-location");
        }}
      />

      <PlanResourceStops
        fuelStop={fuelStop}
        onChangeFuelStop={setFuelStop}
        waterStop={waterStop}
        onChangeWaterStop={setWaterStop}
      />

      <Pressable
        style={styles.saveButton}
        onPress={handleSave}
        disabled={lookingUp}
        accessibilityLabel={
          lookingUp ? "Looking up…" : existing ? "Update Plan" : "Save Plan"
        }
        accessibilityHint={
          lookingUp
            ? "Looking up the address you entered"
            : "Saves this plan and returns to the plans list"
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: lookingUp }}
      >
        <Text style={styles.saveText}>
          {lookingUp ? "Looking up…" : existing ? "Update Plan" : "Save Plan"}
        </Text>
      </Pressable>

      {existing ? (
        <Pressable
          style={styles.deleteButton}
          onPress={handleDelete}
          accessibilityLabel="Delete plan"
          accessibilityHint="Permanently removes this plan after confirmation"
          accessibilityRole="button"
        >
          <Text style={styles.deleteText}>Delete Plan</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    minHeight: touchTarget.minHeight,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: "italic",
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: "center",
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  saveText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.background,
  },
  deleteButton: {
    borderRadius: 8,
    padding: spacing.md,
    alignItems: "center",
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.danger,
  },
});

export default withScreenTitle(ScenarioEditScreen, "Edit Plan");
