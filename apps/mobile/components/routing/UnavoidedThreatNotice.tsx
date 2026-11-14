/**
 * Says when the route was not planned around every threat area (#337).
 *
 * Two things leave a fire or flood area out of the routing request, and both
 * were console-only. The routing engine caps the total outline it will avoid,
 * so when the areas near a trip do not fit, the furthest are left out (#168);
 * and an area whose geometry cannot be read is never sent at all (#287).
 * Either way the driver was shown a route that looks like it avoids danger
 * and does not, at least not all of it.
 *
 * The count is of areas near the trip. An area far from it is clipped away
 * before the limit is applied and is not counted: it could not have changed
 * the route, and warning about it would be a false alarm.
 *
 * It follows the DroppedStopNotice pattern (#341): a pure message function and
 * a thin component, announced as well as rendered, because
 * accessibilityLiveRegion is Android-only and iOS VoiceOver does not announce
 * a view just because it appeared.
 */

import { useEffect, useRef } from "react";
import { AccessibilityInfo, StyleSheet, Text } from "react-native";

import { colors, spacing, typography } from "@/constants/theme";

import type { UnavoidedThreats } from "@bugrout/shared";

/** What the driver can do about it before setting off. */
const ADVICE = "Check the map and the threat warnings before you set off.";

/**
 * The notice for the threat areas a route was not planned around.
 *
 * @param unavoided - What the route carries: a count, `"all"`, or nothing.
 * @returns The notice, or null when the route avoids everything it was asked
 *   to.
 */
export function unavoidedThreatMessage(
  unavoided: UnavoidedThreats | undefined,
): string | null {
  if (unavoided === undefined || unavoided === 0) return null;
  if (unavoided === "all") {
    return `Threat areas could not be avoided on this route. It was planned without going around them and may pass through them. ${ADVICE}`;
  }
  if (unavoided === 1) {
    return `1 threat area on this trip could not be avoided. This route was planned without going around it and may pass through it. ${ADVICE}`;
  }
  return `${String(unavoided)} threat areas on this trip could not be avoided. This route was planned without going around them and may pass through them. ${ADVICE}`;
}

/**
 * Props for {@link UnavoidedThreatNotice}.
 */
interface UnavoidedThreatNoticeProps {
  /** The previewed route's `unavoidedThreats`. */
  unavoided: UnavoidedThreats | undefined;
}

/** The unavoided-threat notice, or nothing when everything was avoided. */
export function UnavoidedThreatNotice({
  unavoided,
}: UnavoidedThreatNoticeProps): React.JSX.Element | null {
  const message = unavoidedThreatMessage(unavoided);
  const announced = useRef<string | null>(null);

  // Announced once per message, not on every render: announceForAccessibility
  // speaks without moving the screen reader's cursor, so the driver hears it
  // while keeping their place on the screen. The live region covers Android.
  useEffect(() => {
    if (message === null) {
      announced.current = null;
      return;
    }
    if (announced.current === message) return;
    announced.current = message;
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  if (message === null) return null;
  return (
    <Text
      style={styles.text}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="unavoided-threats"
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    ...typography.body,
    fontWeight: "600",
    color: colors.warning,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.warning,
    overflow: "hidden",
  },
});
