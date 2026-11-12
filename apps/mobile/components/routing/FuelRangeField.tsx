/**
 * Fuel Range Field
 *
 * One question, asked on the route preview, that the whole fuel warning rests
 * on: how far can you drive on the fuel you have? (#203, spec §7.3)
 *
 * The app cannot read the vehicle's tank, so this is the only source. It is
 * optional on purpose — this is the three-tap bug-out flow and a stressed
 * driver who does not know the answer must be able to go.
 */

import { useCallback } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";

/**
 * Props for {@link FuelRangeField}.
 */
interface FuelRangeFieldProps {
  /** Metres of range entered so far, or `null` while it is blank. */
  value: number | null;
  /** Preferred units, from settings. */
  units: "mi" | "km";
  /** Called with the new range in metres, or `null` when cleared. */
  onChange: (meters: number | null) => void;
}

/** Metres in one unit of each supported distance unit. */
const METERS_PER_UNIT = { mi: 1609.344, km: 1000 } as const;

/**
 * Most digits the field accepts, and the largest range it stores, in the
 * driver's units. `number-pad` limits typing but not pasting: a pasted
 * 20-digit value became a range of ~1e23 m (or `Infinity`), so the "next fuel
 * stop is out of reach" check could never fire for the whole trip (#307).
 * No road vehicle's tank comes near 2000 mi or km.
 */
const MAX_DIGITS = 4;
const MAX_RANGE_UNITS = 2000;

/**
 * A single optional field asking how far the driver can go on current fuel,
 * stored in metres whatever unit it was typed in.
 */
export function FuelRangeField({
  value,
  units,
  onChange,
}: FuelRangeFieldProps): React.JSX.Element {
  const perUnit = METERS_PER_UNIT[units];
  const shown = value === null ? "" : String(Math.round(value / perUnit));

  const handleChange = useCallback(
    (text: string) => {
      const digits = text.replace(/[^0-9]/g, "").slice(0, MAX_DIGITS);
      if (digits === "") {
        onChange(null);
        return;
      }
      onChange(Math.min(Number(digits), MAX_RANGE_UNITS) * perUnit);
    },
    [onChange, perUnit],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label} nativeID="fuel-range-label">
        About how far can you drive on your current fuel?
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          testID="fuel-range-input"
          style={styles.input}
          value={shown}
          onChangeText={handleChange}
          keyboardType="number-pad"
          maxLength={MAX_DIGITS}
          placeholder="Optional"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={`About how far can you drive on your current fuel, in ${units === "mi" ? "miles" : "kilometres"}`}
          accessibilityHint="Optional. Leave it blank to skip; with a range, you are warned before the next fuel stop is out of reach"
          accessibilityLabelledBy="fuel-range-label"
        />
        <Text style={styles.unit}>{units}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    minHeight: touchTarget.minHeight,
  },
  unit: {
    ...typography.body,
    color: colors.textMuted,
    minWidth: 28,
  },
});
