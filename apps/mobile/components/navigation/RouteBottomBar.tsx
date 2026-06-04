/**
 * Route Bottom Bar — ETA, remaining distance, and action buttons.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, View, Text, Pressable } from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { formatDistance, formatDuration } from "@/utils/geo";

/**
 * Props for {@link RouteBottomBar}.
 */
interface RouteBottomBarProps {
  remainingDistance: number; // meters
  remainingDuration: number; // seconds
  onStop: () => void;
  onEmergencyContact: () => void;
  onReroute?: () => void;
  showReroute?: boolean;
}

/**
 * Bottom bar during navigation showing ETA and remaining distance/time, plus
 * actions to reroute, alert emergency contacts, or stop navigation.
 */
export function RouteBottomBar({
  remainingDistance,
  remainingDuration,
  onStop,
  onEmergencyContact,
  onReroute,
  showReroute = false,
}: RouteBottomBarProps): React.JSX.Element {
  const { units } = useSettingsStore();

  // Calculate ETA
  const eta = new Date(Date.now() + remainingDuration * 1000);
  const etaString = eta.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={styles.container}>
      <View style={styles.routeInfo}>
        <Text style={styles.eta}>ETA {etaString}</Text>
        <Text style={styles.remaining}>
          {formatDistance(remainingDistance, units)} ·{" "}
          {formatDuration(remainingDuration)}
        </Text>
      </View>

      <View style={styles.actions}>
        {showReroute && onReroute ? <Pressable
            testID="reroute-btn"
            style={[styles.actionButton, styles.rerouteButton]}
            onPress={onReroute}
            accessibilityLabel="Recalculate route"
            accessibilityHint="Calculates a new route to your destination from your current position"
            accessibilityRole="button"
          >
            <FontAwesome name="refresh" size={18} color={colors.warning} />
          </Pressable> : null}

        <Pressable
          testID="emergency-contact-btn"
          style={styles.actionButton}
          onPress={onEmergencyContact}
          accessibilityLabel="Send location to emergency contacts"
          accessibilityHint="Opens a text message sharing your current location with your saved emergency contacts"
          accessibilityRole="button"
        >
          <FontAwesome name="phone" size={18} color={colors.danger} />
        </Pressable>

        <Pressable
          testID="stop-navigation-btn"
          style={[styles.actionButton, styles.stopButton]}
          onPress={onStop}
          accessibilityLabel="Stop navigation"
          accessibilityHint="Ends turn-by-turn guidance and returns to the map"
          accessibilityRole="button"
        >
          <Text style={styles.stopText}>Stop</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceElevated,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  routeInfo: {
    flex: 1,
  },
  eta: {
    ...typography.subheading,
  },
  remaining: {
    ...typography.caption,
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    minWidth: touchTarget.minWidth,
    minHeight: touchTarget.minHeight,
    borderRadius: 8,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  rerouteButton: {
    borderWidth: 1,
    borderColor: colors.warning,
  },
  stopButton: {
    backgroundColor: colors.danger,
  },
  stopText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.textPrimary,
  },
});
