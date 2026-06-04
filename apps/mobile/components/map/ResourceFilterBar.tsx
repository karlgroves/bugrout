/**
 * Resource Filter Bar
 *
 * Horizontal toolbar overlaid on the map with toggle buttons
 * for fuel, water, and shelter markers.
 */

import { StyleSheet, View, Pressable, Text } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ResourceType } from "@bugrout/shared";
import { useResourceStore } from "@/stores/useResourceStore";
import { colors, spacing } from "@/constants/theme";

const FILTERS: Array<{
  type: ResourceType;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  color: string;
}> = [
  { type: "fuel", icon: "tint", label: "Fuel", color: colors.resourceFuel },
  { type: "water", icon: "tint", label: "Water", color: colors.resourceWater },
  {
    type: "shelter",
    icon: "home",
    label: "Shelter",
    color: colors.resourceShelter,
  },
];

export function ResourceFilterBar() {
  const { visibleTypes, toggleResourceType } = useResourceStore();

  return (
    <View style={styles.container}>
      {FILTERS.map((filter) => {
        const active = visibleTypes.has(filter.type);
        return (
          <Pressable
            key={filter.type}
            style={[styles.button, active && styles.buttonActive]}
            onPress={() => toggleResourceType(filter.type)}
            accessibilityLabel={`${active ? "Hide" : "Show"} ${filter.label} markers`}
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
