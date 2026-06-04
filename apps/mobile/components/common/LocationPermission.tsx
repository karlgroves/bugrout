/**
 * Location Permission Request Component
 *
 * Shown when location permission hasn't been granted.
 * Explains why location is needed and provides a button to request it.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useState, useCallback } from "react";
import { StyleSheet, View, Text, Pressable, Linking } from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import { requestForegroundPermissionsAsync } from "@/platform/location";

/**
 * Props for {@link LocationPermission}.
 */
interface LocationPermissionProps {
  onGranted: () => void;
}

/**
 * Full-screen prompt explaining why location access is needed and letting
 * the user grant it (or open device settings if previously denied).
 */
export function LocationPermission({
  onGranted,
}: LocationPermissionProps): React.JSX.Element {
  const [denied, setDenied] = useState(false);

  const handleRequest = useCallback(async () => {
    const { status } = await requestForegroundPermissionsAsync();
    if (status === "granted") {
      onGranted();
    } else {
      setDenied(true);
    }
  }, [onGranted]);

  return (
    <View style={styles.container}>
      <FontAwesome name="map-marker" size={48} color={colors.accent} />
      <Text style={styles.title}>Location Access Needed</Text>
      <Text style={styles.description}>
        BugRout needs your location to provide turn-by-turn navigation
        and calculate evacuation routes from your current position.
      </Text>
      <Text style={styles.privacy}>
        Your location is processed on-device only and never sent to our
        servers unless you opt in to Crowd Signal.
      </Text>

      {denied ? (
        <>
          <Text style={styles.deniedText}>
            Location permission was denied. Please enable it in your device
            settings to use BugRout.
          </Text>
          <Pressable
            style={styles.settingsButton}
            onPress={() => Linking.openSettings()}
            accessibilityLabel="Open device settings to enable location"
            accessibilityHint="Leaves the app and opens the system settings screen for BugRout"
            accessibilityRole="button"
          >
            <Text style={styles.settingsText}>Open Settings</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          style={styles.allowButton}
          onPress={handleRequest}
          accessibilityLabel="Allow location access"
          accessibilityHint="Shows the system permission prompt to share your location"
          accessibilityRole="button"
        >
          <Text style={styles.allowText}>Allow Location</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  title: {
    ...typography.heading,
    marginTop: spacing.md,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  privacy: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    fontStyle: "italic",
  },
  deniedText: {
    ...typography.body,
    color: colors.warning,
    textAlign: "center",
    lineHeight: 24,
    marginTop: spacing.md,
  },
  allowButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
    marginTop: spacing.md,
  },
  allowText: {
    ...typography.body,
    fontWeight: "700",
    color: colors.background,
  },
  settingsButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minHeight: touchTarget.minHeight,
    justifyContent: "center",
    marginTop: spacing.md,
  },
  settingsText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.accent,
  },
});
