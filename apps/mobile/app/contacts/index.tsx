/**
 * Emergency Contacts Screen
 *
 * Manage up to 5 emergency contacts who receive
 * one-tap SMS with location during evacuation.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Alert,
} from "react-native";
import { v4 as uuidv4 } from "uuid";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import {
  getEmergencyContacts,
  upsertEmergencyContact,
  deleteEmergencyContact,
  type EmergencyContactRow,
} from "@/db/queries/preferences";

const MAX_CONTACTS = 5;

/* eslint-disable max-lines-per-function -- pre-existing oversized contacts screen with inline list and add form; tracked in docs/tech-debt.md (decompose emergency contacts screen) */
/** Manages up to 5 emergency contacts for one-tap SMS during evacuation. */
export default function EmergencyContactsScreen(): React.JSX.Element {
  const [contacts, setContacts] = useState<EmergencyContactRow[]>([]);
  const [editingName, setEditingName] = useState("");
  const [editingPhone, setEditingPhone] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await getEmergencyContacts();
    setContacts(rows);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = useCallback(async () => {
    if (!editingName.trim() || !editingPhone.trim()) {
      Alert.alert("Required", "Enter both name and phone number.");
      return;
    }

    await upsertEmergencyContact({
      id: uuidv4(),
      name: editingName.trim(),
      phone: editingPhone.trim(),
      sortOrder: contacts.length,
    });

    setEditingName("");
    setEditingPhone("");
    setShowAdd(false);
    await refresh();
  }, [editingName, editingPhone, contacts.length, refresh]);

  const handleDelete = useCallback(
    (contact: EmergencyContactRow) => {
      Alert.alert("Remove Contact", `Remove ${contact.name}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await deleteEmergencyContact(contact.id);
              await refresh();
            })();
          },
        },
      ]);
    },
    [refresh],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.description}>
        These contacts receive a one-tap SMS with your location, destination,
        and ETA when you press the emergency button during navigation.
      </Text>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.contactCard}>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{item.name}</Text>
              <Text style={styles.contactPhone}>{item.phone}</Text>
            </View>
            <Pressable
              testID={`remove-contact-${item.id}`}
              style={styles.removeButton}
              onPress={() => { handleDelete(item); }}
              accessibilityLabel={`Remove ${item.name}`}
              accessibilityHint="Removes this person from your emergency contacts"
              accessibilityRole="button"
            >
              <FontAwesome name="times" size={18} color={colors.danger} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FontAwesome name="phone" size={36} color={colors.textMuted} />
            <Text style={styles.emptyText}>No emergency contacts added</Text>
          </View>
        }
      />

      {showAdd ? (
        <View style={styles.addForm}>
          <TextInput
            testID="contact-name-input"
            style={styles.input}
            placeholder="Name"
            placeholderTextColor={colors.textMuted}
            value={editingName}
            onChangeText={setEditingName}
            accessibilityLabel="Contact name"
            accessibilityHint="Enter the name of the person to add as an emergency contact"
          />
          <TextInput
            testID="contact-phone-input"
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor={colors.textMuted}
            value={editingPhone}
            onChangeText={setEditingPhone}
            keyboardType="phone-pad"
            accessibilityLabel="Contact phone number"
            accessibilityHint="Enter the mobile number that will receive your emergency SMS"
          />
          <View style={styles.addActions}>
            <Pressable
              style={styles.cancelButton}
              onPress={() => {
                setShowAdd(false);
                setEditingName("");
                setEditingPhone("");
              }}
              accessibilityLabel="Cancel adding contact"
              accessibilityHint="Discards the entered details and closes the add contact form"
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="save-contact-btn"
              style={styles.saveButton}
              onPress={handleAdd}
              accessibilityLabel="Save contact"
              accessibilityHint="Adds this person to your emergency contacts list"
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        contacts.length < MAX_CONTACTS && (
          <Pressable
            testID="add-contact-btn"
            style={styles.addButton}
            onPress={() => { setShowAdd(true); }}
            accessibilityLabel="Add emergency contact"
            accessibilityHint="Opens a form to enter a new emergency contact"
            accessibilityRole="button"
          >
            <FontAwesome name="plus" size={16} color={colors.accent} />
            <Text style={styles.addButtonText}>Add Contact</Text>
          </Pressable>
        )
      )}

      {contacts.length >= MAX_CONTACTS && (
        <Text style={styles.maxText}>Maximum 5 contacts</Text>
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
  description: {
    ...typography.caption,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    ...typography.body,
    fontWeight: "600",
  },
  contactPhone: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  removeButton: {
    width: touchTarget.minWidth,
    height: touchTarget.minHeight,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  addForm: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    minHeight: touchTarget.minHeight,
  },
  addActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: "center",
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: spacing.md,
    alignItems: "center",
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
  },
  saveText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.background,
  },
  addButton: {
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
  addButtonText: {
    ...typography.body,
    color: colors.accent,
    fontWeight: "600",
  },
  maxText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
