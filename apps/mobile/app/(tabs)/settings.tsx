/* eslint-disable max-lines-per-function -- pre-existing oversized settings screen; tracked in docs/tech-debt.md (decompose settings screen) */
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
} from "react-native";

import { colors, spacing, typography, touchTarget } from "@/constants/theme";
import { useSettingsStore } from "@/stores/useSettingsStore";

/** Settings menu for offline maps, contacts, voice, battery, and legal info. */
export default function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const {
    units,
    voiceEnabled,
    batteryOptimization,
    crowdSignalOptIn,
    setUnits,
    setVoiceEnabled,
    setBatteryOptimization,
    setCrowdSignalOptIn,
  } = useSettingsStore();

  return (
    <ScrollView style={styles.container}>
      {/* Navigation rows */}
      <NavRow
        id="offline-maps"
        icon="download"
        label="Offline Maps"
        hint="Opens the offline map download manager"
        onPress={() => {
          router.push("/downloads");
        }}
      />
      <NavRow
        id="emergency-contacts"
        icon="phone"
        label="Emergency Contacts"
        hint="Opens the emergency contacts manager"
        onPress={() => {
          router.push("/contacts");
        }}
      />

      {/* Toggle rows */}
      <Text style={styles.sectionTitle}>Preferences</Text>

      {/*
        The label deliberately does NOT carry the current value. It used to
        read "Units: Miles", which as an accessible name announced
        "Units: Miles, switch, off" — heard as *miles is turned off*, the
        opposite of what it means. The value moves to the subtitle, where it
        is information rather than part of the control's name, and the hint
        states which way the switch runs.
      */}
      <ToggleRow
        id="units"
        icon="exchange"
        label="Distance units"
        subtitle={units === "mi" ? "Miles" : "Kilometers"}
        hint="On for kilometers, off for miles"
        value={units === "km"}
        onToggle={(v) => {
          setUnits(v ? "km" : "mi");
        }}
      />
      <ToggleRow
        id="voice-navigation"
        icon="volume-up"
        label="Voice Navigation"
        hint="Speaks turn-by-turn directions aloud during navigation"
        value={voiceEnabled}
        onToggle={setVoiceEnabled}
      />
      <ToggleRow
        id="crowd-signal"
        icon="wifi"
        label="Crowd Signal (Anonymous)"
        subtitle="Help other evacuees by sharing anonymous speed data"
        hint="Shares anonymous speed and heading data to warn other evacuees about congestion"
        value={crowdSignalOptIn}
        onToggle={setCrowdSignalOptIn}
      />
      <ToggleRow
        id="battery-optimization"
        icon="battery-full"
        label="Battery Optimization"
        subtitle="Reduce GPS frequency on straight segments"
        hint="Reduces how often location is sampled on straight roads to save battery"
        value={batteryOptimization}
        onToggle={setBatteryOptimization}
      />

      {/* Info rows */}
      <Text style={styles.sectionTitle}>About</Text>

      <NavRow
        id="legal"
        icon="file-text-o"
        label="Legal & Disclaimers"
        hint="Opens the legal disclaimers, privacy policy, and terms of service"
        onPress={() => {
          router.push("/onboarding");
        }}
      />

      <Text style={styles.version}>BugRout v1.0.0</Text>
      <Text style={styles.advisory}>
        Advisory routing only. Do not rely solely on this app for life-safety
        decisions.
      </Text>
    </ScrollView>
  );
}

function NavRow({
  id,
  icon,
  label,
  hint,
  onPress,
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
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      testID={`settings-row-${id}`}
      style={styles.row}
      onPress={onPress}
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

function ToggleRow({
  id,
  icon,
  label,
  subtitle,
  hint,
  value,
  onToggle,
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
        // The visible label lives in a sibling View and is never associated
        // with this control, so without an explicit label the switch has no
        // accessible name at all — four of them announced only as "switch,
        // on". Matches how NavRow above already labels itself.
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={{ false: colors.border, true: colors.accentMuted }}
        thumbColor={value ? colors.accent : colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
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
  version: {
    ...typography.caption,
    textAlign: "center",
    paddingTop: spacing.xl,
    color: colors.textMuted,
  },
  advisory: {
    ...typography.caption,
    textAlign: "center",
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    color: colors.textMuted,
    lineHeight: 20,
  },
});
