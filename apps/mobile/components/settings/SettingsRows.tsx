/**
 * Settings Rows
 *
 * The two kinds of row on the Settings screen: one that opens another screen,
 * and one with a switch. Moved out of `app/(tabs)/settings.tsx` to keep that
 * screen under the file-length limit when Saved Destinations was added (#187).
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter, type Href } from "expo-router";
import { StyleSheet, View, Text, Pressable, Switch } from "react-native";

import {
  colors,
  spacing,
  switchColors,
  typography,
  touchTarget,
} from "@/constants/theme";

/** A row that opens another screen. */
export function NavRow({
  id,
  icon,
  label,
  hint,
  href,
}: {
  /**
   * Stable identifier for the test id.
   *
   * Explicit rather than derived from `label`, because a derived id inherits
   * every problem the display text has. "Crowd Signal (Anonymous)" produced a
   * trailing dash from the closing paren, and "Units: Miles" produced an id
   * that changed when the setting changed — so the Units row had no stable
   * handle at all.
   *
   * A test id built from user-facing copy also breaks whenever that copy is
   * reworded, which is a change nobody expects to break a test. #105
   * demonstrated exactly that while this was in review: it relabelled the
   * Units row to "Distance units", which under derivation would have silently
   * moved its id from `settings-toggle-units-miles` to
   * `settings-toggle-distance-units`.
   */
  id: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  hint: string;
  /** The screen the row opens. */
  href: Href;
}): React.JSX.Element {
  const router = useRouter();
  return (
    <Pressable
      testID={`settings-row-${id}`}
      style={styles.row}
      onPress={() => {
        router.push(href);
      }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityRole="button"
    >
      <FontAwesome
        name={icon}
        size={20}
        color={colors.textSecondary}
        style={styles.rowIcon}
      />
      <Text style={styles.rowLabel}>{label}</Text>
      <FontAwesome name="chevron-right" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

/** A row with a switch. */
export function ToggleRow({
  id,
  icon,
  label,
  subtitle,
  hint,
  value,
  onToggle,
  disabled = false,
}: {
  /** Stable identifier for the test id. See {@link NavRow}. */
  id: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  subtitle?: string;
  /**
   * What the toggle does, announced after its name.
   *
   * Required rather than optional: `subtitle` is decorative text that only
   * some rows have, and a control that states its name but not its effect
   * leaves a screen reader user to guess what "Battery Optimization, switch,
   * on" is going to do to their route.
   */
  hint: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  /** Shown but not operable; the subtitle should say why. */
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <View testID={`settings-toggle-${id}`} style={styles.row}>
      <FontAwesome
        name={icon}
        size={20}
        color={colors.textSecondary}
        style={styles.rowIcon}
      />
      <View style={styles.rowContent}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        accessibilityState={{ disabled }}
        // The visible label lives in a sibling View and is never associated
        // with this control, so without an explicit label the switch has no
        // accessible name at all — four of them announced only as "switch,
        // on". Matches how NavRow above already labels itself.
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={switchColors.trackColor}
        thumbColor={switchColors.thumbColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: touchTarget.minHeight + 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 28,
    textAlign: "center",
  },
  rowLabel: {
    ...typography.body,
    flex: 1,
    marginLeft: spacing.md,
  },
  rowContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  toggleLabel: {
    ...typography.body,
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});
