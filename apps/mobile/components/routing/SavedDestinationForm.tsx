/**
 * Saved Destination Form
 *
 * Adds or edits one saved destination (#187): a name, and a place given as an
 * address or a dropped pin — the same entry the plan editor uses, so it looks
 * the address up at save time and refuses the same things.
 */

import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { v4 as uuidv4 } from "uuid";

import { PlanDestinationField } from "@/components/routing/PlanDestinationField";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import {
  upsertSavedDestination,
  type SavedDestination,
} from "@/db/queries/savedDestinations";
import { useDestinationEntry } from "@/hooks/useDestinationEntry";
import { confirmCoverage } from "@/services/routing/coverage";

/**
 * Props for {@link SavedDestinationForm}.
 */
interface SavedDestinationFormProps {
  /** The entry being edited, or `null` to add one. */
  existing: SavedDestination | null;
  /** Called after a save, or on cancel. */
  onDone: () => void;
}

/** Cancel and Save; Save reads "Looking up…" while an address resolves. */
function FormActions({
  lookingUp,
  onCancel,
  onSave,
}: {
  lookingUp: boolean;
  onCancel: () => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.actions}>
      <Pressable
        style={styles.cancelButton}
        onPress={onCancel}
        accessibilityLabel="Cancel"
        accessibilityHint="Closes the form without saving"
        accessibilityRole="button"
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
      <Pressable
        testID="save-saved-destination-btn"
        style={styles.saveButton}
        onPress={onSave}
        disabled={lookingUp}
        accessibilityLabel={lookingUp ? "Looking up…" : "Save destination"}
        accessibilityHint="Saves this destination to the list"
        accessibilityRole="button"
        accessibilityState={{ disabled: lookingUp }}
      >
        <Text style={styles.saveText}>
          {lookingUp ? "Looking up…" : "Save destination"}
        </Text>
      </Pressable>
    </View>
  );
}

/** The add/edit form for a saved destination. */
export function SavedDestinationForm({
  existing,
  onDone,
}: SavedDestinationFormProps): React.JSX.Element {
  const router = useRouter();
  // Fixed once per form, so a second press of Save mid-save replaces the
  // same row instead of adding a duplicate.
  const [id] = useState(() => existing?.id ?? uuidv4());
  const [name, setName] = useState(existing?.name ?? "");
  const destination = useDestinationEntry(
    existing ? { point: existing.point, address: existing.address } : null,
  );
  const { lookingUp, resolve } = destination;

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      Alert.alert("Name Required", "Enter a name for this destination.");
      return;
    }
    const dest = await resolve();
    if (!dest) return;
    // Warn now, while there's time to download, not when it's needed (#190).
    // Downloading leaves this form on the stack, so what was typed is still
    // here to save when the user comes back (#196).
    const choice = await confirmCoverage(dest.point);
    if (choice === "download") router.push("/downloads");
    if (choice !== "save") return;

    await upsertSavedDestination({
      id,
      name: name.trim(),
      point: dest.point,
      address: dest.address,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    onDone();
  }, [id, name, resolve, existing, onDone, router]);

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        testID="saved-destination-name-input"
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g., Mom's house, Rally point"
        placeholderTextColor={colors.textMuted}
        maxLength={40}
        accessibilityLabel="Destination name"
        accessibilityHint="Enter a short name to identify this destination"
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

      <FormActions
        lookingUp={lookingUp}
        onCancel={onDone}
        onSave={() => {
          void handleSave();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    minHeight: touchTarget.minHeight,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 2,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
  },
  saveText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.background,
  },
});
