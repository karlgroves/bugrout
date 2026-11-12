/**
 * Plan Destination Field
 *
 * Where a plan goes, asked as an address rather than two coordinate fields
 * (#187), with the ambiguous-match list and the map-pin alternative beside it.
 *
 * Lifted out of the plan editor, which `docs/tech-debt.md` records as one to
 * decompose. The editor keeps the save flow; this keeps the asking.
 */

import { StyleSheet, View, Text, TextInput, Pressable } from "react-native";

import { GEOCODER_ATTRIBUTION } from "@/constants/legal";
import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import { DROPPED_PIN_LABEL } from "@/utils/planLabel";

import type { GeocodeResult } from "@/services/geocoding/Geocoder";
import type { LatLng } from "@bugrout/shared";

/**
 * Props for {@link PlanDestinationField}.
 */
interface PlanDestinationFieldProps {
  /** What is in the address field. */
  address: string;
  /** Called as the user types; the caller invalidates any resolved point. */
  onChangeAddress: (text: string) => void;
  /** The destination ready to save, when there is one. */
  resolved: { point: LatLng; address: string | null } | null;
  /** Matches awaiting the user's choice, when an address was ambiguous. */
  matches: GeocodeResult[] | null;
  /** Called with the match the user chose. */
  onPickMatch: (match: GeocodeResult) => void;
  /** Called to open the map and drop a pin instead. */
  onChooseOnMap: () => void;
}

/**
 * Several places match what was typed. The user chooses; the editor never takes
 * the first silently.
 *
 * @param props - The matches and the callback that takes the chosen one.
 * @returns The list of matches, attributed to the geocoder that produced them.
 */
function AmbiguousMatches({
  matches,
  onPickMatch,
}: Pick<PlanDestinationFieldProps, "matches" | "onPickMatch"> & {
  matches: GeocodeResult[];
}): React.JSX.Element {
  return (
    <View style={styles.matches}>
      <Text
        style={styles.matchesTitle}
        accessibilityRole="header"
        aria-level={2}
      >
        {matches.length} places match. Which did you mean?
      </Text>
      {matches.map((match) => (
        <Pressable
          key={`${match.lat},${match.lng}`}
          style={styles.matchRow}
          onPress={() => {
            onPickMatch(match);
          }}
          accessibilityLabel={`Use ${match.displayName}`}
          accessibilityHint="Uses this place as the destination"
          accessibilityRole="button"
        >
          <Text style={styles.matchText}>{match.displayName}</Text>
        </Pressable>
      ))}
      {/* These rows are geocoder results, so they carry the same attribution
          as the destination picker's list (#208). */}
      <Text style={styles.attribution} testID="plan-match-attribution">
        {GEOCODER_ATTRIBUTION}
      </Text>
    </View>
  );
}

/**
 * The address field, what it currently resolves to, any ambiguous matches, and
 * the way to set the destination on a map instead.
 */
export function PlanDestinationField({
  address,
  onChangeAddress,
  resolved,
  matches,
  onPickMatch,
  onChooseOnMap,
}: PlanDestinationFieldProps): React.JSX.Element {
  return (
    <View>
      <Text style={styles.label}>Destination</Text>
      <TextInput
        testID="plan-address-input"
        style={styles.input}
        value={address}
        onChangeText={onChangeAddress}
        placeholder="e.g., 120 Main St, Towson MD"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        accessibilityLabel="Destination address"
        accessibilityHint="Enter the address of the evacuation destination. It is looked up when you save, so do this while you have a connection"
      />

      {/* What will actually be saved, in words. A plan set by a pin has no
          address, and nor has any plan saved before plans had them. */}
      {resolved ? (
        <Text style={styles.resolvedLine} accessibilityLiveRegion="polite">
          {resolved.address
            ? "Address found"
            : `${DROPPED_PIN_LABEL} · ${resolved.point.lat.toFixed(4)}, ${resolved.point.lng.toFixed(4)}`}
        </Text>
      ) : null}

      {matches ? (
        <AmbiguousMatches matches={matches} onPickMatch={onPickMatch} />
      ) : null}

      <Pressable
        testID="plan-pick-on-map-btn"
        style={styles.pinButton}
        onPress={onChooseOnMap}
        accessibilityLabel="Choose on map instead"
        accessibilityHint="Opens a map to drop a pin, which needs no address and no connection"
        accessibilityRole="button"
      >
        <Text style={styles.pinButtonText}>Choose on map instead</Text>
      </Pressable>

      <Text style={styles.hint}>
        An address is looked up when you save, so set this up while you have a
        connection. Dropping a pin needs neither.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    minHeight: touchTarget.minHeight,
  },
  resolvedLine: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  matches: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: "hidden",
  },
  matchesTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  matchRow: {
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  matchText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  attribution: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pinButton: {
    marginTop: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget.minHeight,
  },
  pinButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.accent,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
});
