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
import { useState, useCallback, useEffect } from "react";
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
import { track, Events } from "@/platform/analytics";
import {
  lookupAddress,
  lookupMessage,
  type AddressLookup,
} from "@/services/geocoding/AddressLookup";
import { reverseGeocode } from "@/services/geocoding/Geocoder";
import { confirmCoverage } from "@/services/routing/coverage";
import { useScenarioStore } from "@/stores/useScenarioStore";

import type { GeocodeResult } from "@/services/geocoding/Geocoder";
import type { LatLng, Scenario, ResourceStopPreference } from "@bugrout/shared";

/** Editor for creating or updating an evacuation scenario and its resource stops. */
function ScenarioEditScreen(): React.JSX.Element {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { scenarios, addScenario, updateScenario, deleteScenario } =
    useScenarioStore();

  const existing = id ? scenarios.find((s) => s.id === id) : null;
  const pickedDestination = useScenarioStore((s) => s.pickedDestination);
  const setPickedDestination = useScenarioStore((s) => s.setPickedDestination);

  const [name, setName] = useState(existing?.name ?? "");

  /** What is in the address field. Empty for a plan set by a pin. */
  const [address, setAddress] = useState(existing?.address ?? "");

  /**
   * The destination ready to save, and the address to save with it.
   *
   * Non-null means no lookup is needed: it came from a pin, from a match the
   * user chose, or from the plan as it was already saved. That last case is
   * why editing a plan's name still works with no signal — nothing re-resolves
   * a destination that is already resolved.
   *
   * Typing in the address field clears it, because the text no longer
   * describes the point.
   */
  const [resolved, setResolved] = useState<{
    point: LatLng;
    address: string | null;
  } | null>(
    existing
      ? { point: existing.destination, address: existing.address }
      : null,
  );

  /** Matches awaiting the user's choice; never resolved by taking the first. */
  const [matches, setMatches] = useState<GeocodeResult[] | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const [fuelStop, setFuelStop] = useState(
    existing?.resourceStops.find((r) => r.type === "fuel")?.enabled ?? false,
  );
  const [waterStop, setWaterStop] = useState(
    existing?.resourceStops.find((r) => r.type === "water")?.enabled ?? false,
  );

  // A point chosen on the map arrives through the store. Reverse-geocode it
  // once, here, where the user has just asked for it — rather than filling in
  // addresses for plans in the background, which would send where someone is
  // going to a third party nobody invited.
  useEffect(() => {
    if (!pickedDestination) return;
    const point = pickedDestination;
    setPickedDestination(null);
    setResolved({ point, address: null });
    setMatches(null);
    setAddress("");

    void reverseGeocode(point)
      .then((found) => {
        if (!found) return;
        setAddress(found);
        setResolved({ point, address: found });
      })
      .catch(() => {
        // A pin is allowed to have no address: a rally point in a field has
        // none, and offline there is no way to ask. The plan saves either way.
      });
  }, [pickedDestination, setPickedDestination]);

  /** Save with a destination already resolved; the only path that writes. */
  const save = useCallback(
    async (point: LatLng, savedAddress: string | null) => {
      // Warn now, while there's time to download, not when it's needed (#190).
      if (!(await confirmCoverage(point))) return;

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

  /** A match the user chose from an ambiguous address. */
  const handlePickMatch = useCallback((match: GeocodeResult) => {
    setResolved({
      point: { lat: match.lat, lng: match.lng },
      address: match.displayName,
    });
    setAddress(match.displayName);
    setMatches(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Name Required", "Enter a name for this plan.");
      return;
    }

    // Already resolved — a pin, a chosen match, or the plan as saved. Nothing
    // to look up, so this works with no connection.
    if (resolved) {
      await save(resolved.point, resolved.address);
      return;
    }

    if (!address.trim()) {
      Alert.alert(
        "Destination Required",
        "Enter an address, or drop a pin on the map.",
      );
      return;
    }

    setLookingUp(true);
    let lookup: AddressLookup;
    try {
      lookup = await lookupAddress(address);
    } finally {
      setLookingUp(false);
    }

    if (lookup.kind === "one") {
      await save(
        { lat: lookup.match.lat, lng: lookup.match.lng },
        lookup.match.displayName,
      );
      return;
    }

    if (lookup.kind === "many") {
      // Several places match. Offer them; never pick one silently.
      setMatches(lookup.matches);
      return;
    }

    if (lookup.kind === "superseded") return;

    // Nothing is saved, and what was typed is left alone to be corrected.
    const message = lookupMessage(lookup);
    if (message) Alert.alert(message.title, message.body);
  }, [name, address, resolved, save]);

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
    <ScrollView style={styles.container}>
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
        address={address}
        onChangeAddress={(text) => {
          setAddress(text);
          // The text no longer describes the resolved point, so it has to be
          // looked up again before this can be saved.
          setResolved(null);
          setMatches(null);
        }}
        resolved={resolved}
        matches={matches}
        onPickMatch={handlePickMatch}
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
