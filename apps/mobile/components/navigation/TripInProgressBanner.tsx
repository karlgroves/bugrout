/**
 * A trip is running but the user is on the map, not the navigation screen
 * (#189).
 *
 * The map hides the Bug Out button during a trip. It used to show nothing in
 * its place, so a user who left navigation — the Android back button, or a
 * route left active by the preview — had a route drawn, no Bug Out, and no Stop
 * anywhere: the only way out was to force-quit. This offers both ways out.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, View, Text, Pressable } from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";

/** Props for {@link TripInProgressBanner}. */
interface TripInProgressBannerProps {
  /** Return to turn-by-turn navigation. */
  onResume: () => void;
  /** Stop navigating and clear the route. */
  onEnd: () => void;
}

/**
 * "Trip in progress" with Resume and End trip, shown on the map in place of
 * the Bug Out button.
 */
export function TripInProgressBanner({
  onResume,
  onEnd,
}: TripInProgressBannerProps): React.JSX.Element {
  return (
    <View style={styles.banner} testID="trip-in-progress">
      <View style={styles.label}>
        <FontAwesome name="location-arrow" size={16} color={colors.accent} />
        <Text style={styles.title} accessibilityRole="header">
          Trip in progress
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={[styles.button, styles.resume]}
          onPress={onResume}
          accessibilityRole="button"
          accessibilityLabel="Resume navigation"
          accessibilityHint="Returns to turn-by-turn directions"
          testID="trip-resume-btn"
        >
          <Text style={styles.resumeText}>Resume</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.end]}
          onPress={onEnd}
          accessibilityRole="button"
          accessibilityLabel="End trip"
          accessibilityHint="Stops navigation and clears the route"
          testID="trip-end-btn"
        >
          <Text style={styles.endText}>End trip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    bottom: spacing.xl,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  label: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: typography.subheading,
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    minHeight: touchTarget.minHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  resume: {
    backgroundColor: colors.accent,
  },
  resumeText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.background,
  },
  end: {
    borderColor: colors.danger,
    borderWidth: 1,
  },
  endText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.danger,
  },
});
