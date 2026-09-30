/**
 * The honest "no route" state (#190).
 *
 * Shown in place of a route when routing fails. It says why in plain words,
 * points at official evacuation routes, and — when the destination is outside
 * the road data — offers Offline Maps. It never shows a line, a distance or an
 * ETA the app did not actually compute; routing used to fall back to a made-up
 * straight-line route that looked exactly like a real one.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { Alert, StyleSheet, View, Text, Pressable } from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import { routeUnavailableMessage } from "@/services/routing/RouteUnavailable";

/**
 * The same explanation as an alert, for places with no room for the card: the
 * map's scenario chips and the navigation screen's reroute.
 *
 * @param error - What the routing call threw.
 * @param openDownloads - Opens Offline Maps; offered when that is the fix.
 * @param dismissLabel - The button that closes the alert.
 */
export function alertRouteUnavailable(
  error: unknown,
  openDownloads: () => void,
  dismissLabel = "OK",
): void {
  const { title, body, suggestDownloads } = routeUnavailableMessage(error);
  Alert.alert(
    title,
    body,
    suggestDownloads
      ? [
          { text: dismissLabel, style: "cancel" },
          { text: "Offline Maps", onPress: openDownloads },
        ]
      : [{ text: dismissLabel }],
  );
}

/** Props for {@link RouteUnavailableNotice}. */
interface RouteUnavailableNoticeProps {
  /** What the routing call threw. */
  error: unknown;
}

/**
 * Explains why no route could be calculated and what to do next.
 */
export function RouteUnavailableNotice({
  error,
}: RouteUnavailableNoticeProps): React.JSX.Element {
  const router = useRouter();
  const { title, body, suggestDownloads } = routeUnavailableMessage(error);

  return (
    <View
      style={styles.card}
      testID="route-unavailable"
      // Announced when it appears: the user just pressed a button and is
      // waiting on a route, so silence would read as "still working".
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View style={styles.header}>
        <FontAwesome
          name="exclamation-triangle"
          size={16}
          color={colors.warning}
        />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <Text style={styles.body}>{body}</Text>
      {suggestDownloads ? (
        <Pressable
          style={styles.action}
          onPress={() => {
            router.push("/downloads");
          }}
          accessibilityRole="button"
          accessibilityLabel="Offline Maps"
          accessibilityHint="Opens the offline map downloads"
          testID="route-unavailable-downloads"
        >
          <FontAwesome name="download" size={14} color={colors.textPrimary} />
          <Text style={styles.actionText}>Offline Maps</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...typography.subheading,
    flexShrink: 1,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
    minHeight: touchTarget.minHeight,
    paddingHorizontal: spacing.md,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
  },
  actionText: {
    ...typography.body,
    fontWeight: "600",
  },
});
