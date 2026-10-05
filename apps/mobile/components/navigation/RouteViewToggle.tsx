/**
 * Map / Directions switch for the route preview and navigation (#192).
 */

import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing, touchTarget } from "@/constants/theme";

import type { RouteView } from "@/stores/useRouteStore";

/**
 * Props for {@link RouteViewToggle}.
 */
interface RouteViewToggleProps {
  value: RouteView;
  onChange: (view: RouteView) => void;
}

const OPTIONS: { view: RouteView; label: string; hint: string }[] = [
  { view: "map", label: "Map", hint: "Shows the route on the map" },
  {
    view: "directions",
    label: "Directions",
    hint: "Shows the route as a list of turns with times",
  },
];

/**
 * A two-option segmented control. Each option is a tab that announces whether
 * it is selected; one tap switches, within reach of one thumb.
 */
export function RouteViewToggle({
  value,
  onChange,
}: RouteViewToggleProps): React.JSX.Element {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {OPTIONS.map(({ view, label, hint }) => {
        const selected = view === value;
        return (
          <Pressable
            key={view}
            style={[styles.option, selected && styles.selected]}
            onPress={() => {
              onChange(view);
            }}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityHint={hint}
            accessibilityState={{ selected }}
            testID={`route-view-${view}`}
          >
            <Text style={[styles.text, selected && styles.selectedText]}>
              {label}
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
    margin: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    overflow: "hidden",
  },
  option: {
    flex: 1,
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  selected: {
    backgroundColor: colors.accent,
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  selectedText: {
    color: colors.background,
  },
});
