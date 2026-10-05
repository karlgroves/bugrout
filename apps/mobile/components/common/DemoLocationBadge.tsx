/**
 * Demo Location Badge (#205)
 *
 * While the demo location is on, the position on the map is a simulated one in
 * Baltimore. In an evacuation app that must never be mistaken for the real
 * thing, so the map and the navigation screen say so beside the connection
 * status, for as long as it is on.
 */

import { StyleSheet, View, Text } from "react-native";

import { colors, spacing } from "@/constants/theme";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * "DEMO LOCATION" while the demo location is on; nothing otherwise.
 *
 * @param compact - Show "DEMO", for the navigation screen's crowded status
 *   row; the spoken label is the same either way.
 */
export function DemoLocationBadge({
  compact = false,
}: {
  compact?: boolean;
}): React.JSX.Element | null {
  const demoLocation = useSettingsStore((s) => s.demoLocation);
  if (!demoLocation) return null;
  return (
    <View
      style={styles.container}
      testID="demo-location-badge"
      accessibilityLabel="Demo location on. Your position is simulated in Baltimore, not where you are."
      accessibilityHint="Turn off Demo location in Settings to use your real position"
      accessibilityRole="text"
    >
      <Text style={styles.text}>{compact ? "DEMO" : "DEMO LOCATION"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.warning,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.background,
    letterSpacing: 1,
  },
});
