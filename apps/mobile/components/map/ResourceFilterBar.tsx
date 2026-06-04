/**
 * Resource Filter Bar
 *
 * Horizontal toolbar overlaid on the map with toggle buttons
 * for fuel, water, and shelter markers.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, View, Pressable, Text } from "react-native";

import { colors, spacing } from "@/constants/theme";
import { useResourceStore } from "@/stores/useResourceStore";

import type { ResourceType } from "@bugrout/shared";

const FILTERS: {
  type: ResourceType;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  color: string;
}[] = [
  { type: "fuel", icon: "tint", label: "Fuel", color: colors.resourceFuel },
  { type: "water", icon: "tint", label: "Water", color: colors.resourceWater },
  {
    type: "shelter",
    icon: "home",
    label: "Shelter",
    color: colors.resourceShelter,
  },
];

/**
 * Horizontal toolbar overlaid on the map with toggle buttons for showing or
 * hiding fuel, water, and shelter resource markers.
 */
export function ResourceFilterBar(): React.JSX.Element {
  const { visibleTypes, toggleResourceType } = useResourceStore();

  return (
    <View style={styles.container}>
      {FILTERS.map((filter) => {
        const active = visibleTypes.has(filter.type);
        return (
          <Pressable
            key={filter.type}
            style={[styles.button, active && styles.buttonActive]}
            onPress={() => {
              toggleResourceType(filter.type);
            }}
            accessibilityLabel={`${active ? "Hide" : "Show"} ${filter.label} markers`}
            accessibilityHint={
              active
                ? `Removes ${filter.label} markers from the map`
                : `Adds ${filter.label} markers to the map`
            }
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <FontAwesome
              name={filter.icon}
              size={14}
              color={active ? filter.color : colors.textMuted}
            />
            <Text
              style={[
                styles.label,
                { color: active ? filter.color : colors.textMuted },
              ]}
            >
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: 8,
    minHeight: 32,
    backgroundColor: "transparent",
  },
  buttonActive: {
    backgroundColor: colors.surface,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
});
