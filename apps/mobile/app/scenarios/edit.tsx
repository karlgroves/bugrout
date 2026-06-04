/**
 * Scenario Editor
 *
 * Create or edit an evacuation scenario with:
 * - Name
 * - Destination (tap on map or search)
 * - Resource stop preferences (fuel, water with max detour)
 */

/* eslint-disable max-lines-per-function, complexity -- pre-existing oversized scenario editor with inline form fields and validation; tracked in docs/tech-debt.md (decompose scenario editor) */
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import { v4 as uuidv4 } from "uuid";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import {
  upsertScenario,
  deleteScenario as dbDeleteScenario,
} from "@/db/queries/scenarios";
import { track, Events } from "@/platform/analytics";
import { useScenarioStore } from "@/stores/useScenarioStore";

import type { Scenario, ResourceStopPreference } from "@bugrout/shared";

/** Editor for creating or updating an evacuation scenario and its resource stops. */
export default function ScenarioEditScreen(): React.JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { scenarios, addScenario, updateScenario, deleteScenario } =
    useScenarioStore();

  const existing = id ? scenarios.find((s) => s.id === id) : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [destLat, setDestLat] = useState(
    existing?.destination.lat.toString() ?? "",
  );
  const [destLng, setDestLng] = useState(
    existing?.destination.lng.toString() ?? "",
  );
  const [fuelStop, setFuelStop] = useState(
    existing?.resourceStops.find((r) => r.type === "fuel")?.enabled ?? false,
  );
  const [waterStop, setWaterStop] = useState(
    existing?.resourceStops.find((r) => r.type === "water")?.enabled ?? false,
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Name Required", "Enter a name for this scenario.");
      return;
    }

    const lat = parseFloat(destLat);
    const lng = parseFloat(destLng);
    if (isNaN(lat) || isNaN(lng)) {
      Alert.alert(
        "Destination Required",
        "Enter valid coordinates for the destination.",
      );
      return;
    }

    const resourceStops: ResourceStopPreference[] = [
      { type: "fuel", maxDetour: 16000, enabled: fuelStop }, // 10 miles
      { type: "water", maxDetour: 16000, enabled: waterStop },
    ];

    const scenario: Scenario = {
      id: existing?.id ?? uuidv4(),
      name: name.trim(),
      destination: { lat, lng },
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
  }, [
    name,
    destLat,
    destLng,
    fuelStop,
    waterStop,
    existing,
    addScenario,
    updateScenario,
    router,
  ]);

  const handleDelete = useCallback(() => {
    if (!existing) return;
    Alert.alert("Delete Scenario", `Delete "${existing.name}"?`, [
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
    <ScrollView style={styles.container}>
      <Text style={styles.label}>Scenario Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g., Wildfire East, Grid Down"
        placeholderTextColor={colors.textMuted}
        maxLength={40}
        accessibilityLabel="Scenario name"
        accessibilityHint="Enter a short name to identify this evacuation scenario"
      />

      <Text style={styles.label}>Destination Coordinates</Text>
      <View style={styles.coordRow}>
        <TextInput
          style={[styles.input, styles.coordInput]}
          value={destLat}
          onChangeText={setDestLat}
          placeholder="Latitude"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          accessibilityLabel="Destination latitude"
          accessibilityHint="Enter the latitude coordinate of the evacuation destination"
        />
        <TextInput
          style={[styles.input, styles.coordInput]}
          value={destLng}
          onChangeText={setDestLng}
          placeholder="Longitude"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          accessibilityLabel="Destination longitude"
          accessibilityHint="Enter the longitude coordinate of the evacuation destination"
        />
      </View>
      <Text style={styles.hint}>
        Tip: Use the map to tap a destination, then copy the coordinates here.
      </Text>

      <Text style={styles.sectionTitle}>Resource Stops</Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Include fuel stop</Text>
        <Switch
          value={fuelStop}
          onValueChange={setFuelStop}
          trackColor={{ false: colors.border, true: colors.accentMuted }}
          thumbColor={fuelStop ? colors.accent : colors.textMuted}
        />
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Include water stop</Text>
        <Switch
          value={waterStop}
          onValueChange={setWaterStop}
          trackColor={{ false: colors.border, true: colors.accentMuted }}
          thumbColor={waterStop ? colors.accent : colors.textMuted}
        />
      </View>

      <Pressable
        style={styles.saveButton}
        onPress={handleSave}
        accessibilityLabel="Save scenario"
        accessibilityHint="Saves this scenario and returns to the scenarios list"
        accessibilityRole="button"
      >
        <Text style={styles.saveText}>
          {existing ? "Update Scenario" : "Save Scenario"}
        </Text>
      </Pressable>

      {existing ? (
        <Pressable
          style={styles.deleteButton}
          onPress={handleDelete}
          accessibilityLabel="Delete scenario"
          accessibilityHint="Permanently removes this scenario after confirmation"
          accessibilityRole="button"
        >
          <Text style={styles.deleteText}>Delete Scenario</Text>
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
  coordRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  coordInput: {
    flex: 1,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: "italic",
  },
  sectionTitle: {
    ...typography.subheading,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: touchTarget.minHeight,
  },
  switchLabel: {
    ...typography.body,
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
