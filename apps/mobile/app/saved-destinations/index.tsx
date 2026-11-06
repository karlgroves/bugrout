/**
 * Saved Destinations Screen
 *
 * Places set up ahead of time — a relative's house, a designated shelter, a
 * rally point — entered calmly while online, and listed first in the
 * destination picker so they are one tap away at bug-out time (#187).
 *
 * Deliberately simpler than plans: a name and a place, no stop preferences,
 * and a higher cap. Kept on the device only.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { withScreenTitle } from "@/components/common/ScreenTitle";
import { SavedDestinationForm } from "@/components/routing/SavedDestinationForm";
import {
  buttons,
  colors,
  spacing,
  typography,
  touchTarget,
} from "@/constants/theme";
import {
  deleteSavedDestination,
  getSavedDestinations,
  MAX_SAVED_DESTINATIONS,
  type SavedDestination,
} from "@/db/queries/savedDestinations";
import { planDestinationLabel } from "@/utils/planLabel";

/** One saved destination: tap to edit, or remove it. */
function SavedDestinationRow({
  item,
  onEdit,
  onRemove,
}: {
  item: SavedDestination;
  onEdit: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Pressable
        testID={`edit-saved-destination-${item.id}`}
        style={styles.cardBody}
        onPress={onEdit}
        accessibilityLabel={`Edit ${item.name}`}
        accessibilityHint="Opens this destination to rename it or change where it is"
        accessibilityRole="button"
      >
        <Text style={styles.cardName}>{item.name}</Text>
        <Text style={styles.cardDetail} numberOfLines={1}>
          {planDestinationLabel(item)}
        </Text>
      </Pressable>
      <Pressable
        testID={`remove-saved-destination-${item.id}`}
        style={styles.removeButton}
        onPress={onRemove}
        accessibilityLabel={`Remove ${item.name}`}
        accessibilityHint="Removes this destination after confirmation"
        accessibilityRole="button"
      >
        <FontAwesome name="times" size={18} color={colors.danger} />
      </Pressable>
    </View>
  );
}

/** The Add button, or the cap once it is reached. */
function AddDestination({
  full,
  onAdd,
}: {
  full: boolean;
  onAdd: () => void;
}): React.JSX.Element {
  return !full ? (
    <Pressable
      testID="add-saved-destination-btn"
      style={buttons.addOutline}
      onPress={onAdd}
      accessibilityLabel="Add Destination"
      accessibilityHint="Opens a form to save a new destination"
      accessibilityRole="button"
    >
      <FontAwesome name="plus" size={16} color={colors.accent} />
      <Text style={styles.addButtonText}>Add Destination</Text>
    </Pressable>
  ) : (
    <Text style={styles.emptyText}>
      Maximum {MAX_SAVED_DESTINATIONS} destinations
    </Text>
  );
}

/** Lists, adds, edits and removes saved destinations. */
function SavedDestinationsScreen(): React.JSX.Element {
  const [saved, setSaved] = useState<SavedDestination[]>([]);
  // The entry in the form: one being edited, "new", or none (form closed).
  const [editing, setEditing] = useState<SavedDestination | "new" | null>(null);

  const refresh = useCallback(async () => {
    setSaved(await getSavedDestinations());
  }, []);

  useEffect(() => {
    refresh().catch((err: unknown) => {
      console.error("Failed to load saved destinations", err);
    });
  }, [refresh]);

  const handleRemove = useCallback(
    (item: SavedDestination) => {
      Alert.alert("Remove Destination", `Remove ${item.name}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void deleteSavedDestination(item.id).then(refresh);
          },
        },
      ]);
    },
    [refresh],
  );

  if (editing) {
    return (
      <View style={styles.container}>
        {/* Keyed so switching entries starts the form afresh. */}
        <SavedDestinationForm
          key={editing === "new" ? "new" : editing.id}
          existing={editing === "new" ? null : editing}
          onDone={() => {
            setEditing(null);
            void refresh();
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.description}>
        Set up places ahead of time, while you are calm and online. They are
        listed first when you choose where to go. Saved on this device only.
      </Text>

      <FlatList
        data={saved}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SavedDestinationRow
            item={item}
            onEdit={() => {
              setEditing(item);
            }}
            onRemove={() => {
              handleRemove(item);
            }}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No saved destinations yet</Text>
        }
      />

      <AddDestination
        full={saved.length >= MAX_SAVED_DESTINATIONS}
        onAdd={() => {
          setEditing("new");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  description: {
    ...typography.caption,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  cardBody: {
    flex: 1,
    padding: spacing.md,
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
  },
  cardName: {
    ...typography.body,
    fontWeight: "600",
  },
  cardDetail: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  removeButton: {
    width: touchTarget.minWidth,
    height: touchTarget.minHeight,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    padding: spacing.lg,
  },
  addButtonText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: "600",
  },
});

export default withScreenTitle(SavedDestinationsScreen, "Saved Destinations");
