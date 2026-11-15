/* eslint-disable max-lines-per-function -- pre-existing oversized settings screen; tracked in docs/tech-debt.md (decompose settings screen) */
import { StyleSheet, Text, ScrollView } from "react-native";

import { withScreenTitle } from "@/components/common/ScreenTitle";
import { NavRow, ToggleRow } from "@/components/settings/SettingsRows";
import { colors, spacing, typography } from "@/constants/theme";
import { useRouteStore } from "@/stores/useRouteStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

/** Settings menu for offline maps, contacts, saved destinations, voice, battery, and legal info. */
function SettingsScreen(): React.JSX.Element {
  const {
    units,
    voiceEnabled,
    batteryOptimization,
    crowdSignalOptIn,
    crashReportingOptIn,
    demoLocation,
    setUnits,
    setVoiceEnabled,
    setBatteryOptimization,
    setCrowdSignalOptIn,
    setCrashReportingOptIn,
    setDemoLocation,
  } = useSettingsStore();
  // Switching the position source mid-trip would cut navigation off from its
  // location feed, so the demo location can only change between trips.
  const tripUnderway = useRouteStore(
    (s) => s.status === "active" || s.status === "rerouting",
  );

  return (
    <ScrollView style={styles.container}>
      {/* Navigation rows */}
      <NavRow
        id="offline-maps"
        icon="download"
        label="Offline Maps"
        hint="Opens the offline map download manager"
        href="/downloads"
      />
      <NavRow
        id="emergency-contacts"
        icon="phone"
        label="Emergency Contacts"
        hint="Opens the emergency contacts manager"
        href="/contacts"
      />
      <NavRow
        id="saved-destinations"
        icon="map-marker"
        label="Saved Destinations"
        hint="Opens the list of places you have set up ahead of time"
        href="/saved-destinations"
      />

      {/* Toggle rows */}
      <Text
        style={styles.sectionTitle}
        accessibilityRole="header"
        aria-level={2}
      >
        Preferences
      </Text>

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
        id="crash-reports"
        icon="bug"
        label="Crash Reports"
        subtitle="Send crash traces to help fix bugs. Off unless you turn it on."
        hint="Sends crash traces to our error-reporting provider. Coordinates and contact details are stripped before sending."
        value={crashReportingOptIn}
        onToggle={setCrashReportingOptIn}
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

      {/* For App Review (#205): coverage is Maryland only for now. */}
      <Text
        style={styles.sectionTitle}
        accessibilityRole="header"
        aria-level={2}
      >
        Testing
      </Text>
      <ToggleRow
        id="demo-location"
        icon="map-marker"
        label="Demo location"
        subtitle={
          tripUnderway
            ? "Can't be changed during a trip. End the trip first."
            : "Simulate being in Baltimore, MD, and drive each route. Not your real position. Off when the app restarts."
        }
        hint="Replaces your real position with a simulated one in Baltimore, Maryland, which drives along the route during navigation"
        value={demoLocation}
        onToggle={setDemoLocation}
        disabled={tripUnderway}
      />

      {/* Info rows */}
      <Text
        style={styles.sectionTitle}
        accessibilityRole="header"
        aria-level={2}
      >
        About
      </Text>

      <NavRow
        id="legal"
        icon="file-text-o"
        label="Legal & Disclaimers"
        hint="Opens the legal disclaimers, privacy policy, and terms of service"
        href="/onboarding"
      />

      <Text style={styles.version}>BugRout v1.0.0</Text>
      <Text style={styles.advisory}>
        Advisory routing only. Do not rely solely on this app for life-safety
        decisions.
      </Text>
    </ScrollView>
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

export default withScreenTitle(SettingsScreen, "Settings");
