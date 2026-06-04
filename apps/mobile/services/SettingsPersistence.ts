/**
 * Settings Persistence
 *
 * Subscribes to Zustand settings store changes and auto-persists
 * to SQLite preferences table. Prevents redundant writes by tracking
 * the last persisted values.
 */

import { useSettingsStore } from "@/stores/useSettingsStore";
import { setPreference } from "@/db/queries/preferences";

let lastPersisted = {
  units: "",
  voiceEnabled: "",
  batteryOptimization: "",
  crowdSignalOptIn: "",
};

/**
 * Start watching the settings store and persist changes to SQLite.
 * Call once during app bootstrap.
 * Returns an unsubscribe function.
 */
export function startSettingsPersistence(): () => void {
  const unsubscribe = useSettingsStore.subscribe((state) => {
    const current = {
      units: state.units,
      voiceEnabled: String(state.voiceEnabled),
      batteryOptimization: String(state.batteryOptimization),
      crowdSignalOptIn: String(state.crowdSignalOptIn),
    };

    // Only persist changed values
    if (current.units !== lastPersisted.units) {
      setPreference("units", current.units);
      lastPersisted.units = current.units;
    }
    if (current.voiceEnabled !== lastPersisted.voiceEnabled) {
      setPreference("voice_enabled", current.voiceEnabled);
      lastPersisted.voiceEnabled = current.voiceEnabled;
    }
    if (current.batteryOptimization !== lastPersisted.batteryOptimization) {
      setPreference("battery_optimization", current.batteryOptimization);
      lastPersisted.batteryOptimization = current.batteryOptimization;
    }
    if (current.crowdSignalOptIn !== lastPersisted.crowdSignalOptIn) {
      setPreference("crowd_signal_opt_in", current.crowdSignalOptIn);
      lastPersisted.crowdSignalOptIn = current.crowdSignalOptIn;
    }
  });

  // Initialize lastPersisted with current state
  const state = useSettingsStore.getState();
  lastPersisted = {
    units: state.units,
    voiceEnabled: String(state.voiceEnabled),
    batteryOptimization: String(state.batteryOptimization),
    crowdSignalOptIn: String(state.crowdSignalOptIn),
  };

  return unsubscribe;
}
