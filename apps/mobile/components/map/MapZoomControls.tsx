/**
 * Zoom in / zoom out buttons for the map (#188).
 *
 * Pinch was the only way to zoom out: a multipoint gesture with no
 * single-pointer alternative (WCAG 2.2 SC 2.5.1), and hard to do one-handed,
 * gloved, in a moving vehicle, or with a screen reader running.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Pressable, StyleSheet, View } from "react-native";

import { colors, spacing, touchTarget } from "@/constants/theme";

/**
 * Props for {@link MapZoomControls}.
 */
interface MapZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** False at the maximum zoom: the button is disabled and says so. */
  canZoomIn: boolean;
  /** False at the minimum zoom. */
  canZoomOut: boolean;
}

/**
 * A pair of 44pt zoom buttons pinned to the map's right edge, vertically
 * centred, clear of the status badge, the Bug Out button, the resource and
 * scenario chips, and the navigation screen's maneuver card and bottom bar.
 */
export function MapZoomControls({
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
}: MapZoomControlsProps): React.JSX.Element {
  return (
    <View style={styles.container} testID="map-zoom-controls">
      <Pressable
        style={[styles.button, !canZoomIn && styles.disabled]}
        onPress={onZoomIn}
        disabled={!canZoomIn}
        accessibilityRole="button"
        accessibilityLabel="Zoom in"
        accessibilityHint="Shows the map in more detail"
        accessibilityState={{ disabled: !canZoomIn }}
      >
        <FontAwesome name="plus" size={18} color={colors.textPrimary} />
      </Pressable>
      <Pressable
        style={[styles.button, !canZoomOut && styles.disabled]}
        onPress={onZoomOut}
        disabled={!canZoomOut}
        accessibilityRole="button"
        accessibilityLabel="Zoom out"
        accessibilityHint="Shows more of the map"
        accessibilityState={{ disabled: !canZoomOut }}
      >
        <FontAwesome name="minus" size={18} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: spacing.md,
    top: "40%",
    zIndex: 10,
    gap: spacing.sm,
  },
  button: {
    width: touchTarget.minWidth,
    height: touchTarget.minHeight,
    borderRadius: touchTarget.minWidth / 2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    // The outline, not the fill, carries the 3:1 against the dark map:
    // #a3a3a3 on the #0a0a0a land colour is about 8:1.
    borderWidth: 2,
    borderColor: colors.textSecondary,
  },
  disabled: {
    opacity: 0.4,
  },
});
