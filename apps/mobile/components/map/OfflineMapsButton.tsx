/**
 * Map control that opens Offline Maps.
 *
 * Gives the Map tab a lasting way to get more maps once a region is
 * downloaded (#174). The map screen decides when it shows.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Pressable, StyleSheet, Text } from "react-native";

import {
  colors,
  spacing,
  statusIndicator,
  touchTarget,
} from "@/constants/theme";

/**
 * Props for {@link OfflineMapsButton}.
 */
interface OfflineMapsButtonProps {
  /** Opens the download manager. */
  onPress: () => void;
}

/**
 * Compact "Offline maps" button pinned top left, opposite the status badge.
 */
export function OfflineMapsButton({
  onPress,
}: OfflineMapsButtonProps): React.JSX.Element {
  return (
    <Pressable
      testID="offline-maps-button"
      style={styles.button}
      onPress={onPress}
      accessibilityLabel="Offline maps"
      accessibilityHint="Opens the download manager to get or update offline maps"
      accessibilityRole="button"
    >
      <FontAwesome name="download" size={14} color={colors.textSecondary} />
      <Text style={styles.text}>Offline maps</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    // Level with the status badge it sits opposite.
    top: statusIndicator.top,
    left: spacing.md,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touchTarget.minHeight,
    minWidth: touchTarget.minWidth,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});
