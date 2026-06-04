/**
 * Settings Persistence
 *
 * Subscribes to Zustand settings store changes and auto-persists
 * to SQLite preferences table. Prevents redundant writes by tracking
 * the last persisted values.
 */

import { setPreference } from "@/db/queries/preferences";
import { useSettingsStore } from "@/stores/useSettingsStore";

let lastPersisted = {
  units: "",
  voiceEnabled: "",
  batteryOptimization: "",
  crowdSignalOptIn: "",
};

/**
 * Persist a preference fire-and-forget from the synchronous store subscriber,
 * surfacing (not swallowing) any write failure.
 */
function persistPreference(key: string, value: string): void {
  setPreference(key, value).catch((err: unknown) => {
    console.error(`[BugRout] failed to persist preference "${key}":`, err);
  });
}

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
      persistPreference("units", current.units);
      lastPersisted.units = current.units;
    }
    if (current.voiceEnabled !== lastPersisted.voiceEnabled) {
      persistPreference("voice_enabled", current.voiceEnabled);
      lastPersisted.voiceEnabled = current.voiceEnabled;
    }
    if (current.batteryOptimization !== lastPersisted.batteryOptimization) {
      persistPreference("battery_optimization", current.batteryOptimization);
      lastPersisted.batteryOptimization = current.batteryOptimization;
    }
    if (current.crowdSignalOptIn !== lastPersisted.crowdSignalOptIn) {
      persistPreference("crowd_signal_opt_in", current.crowdSignalOptIn);
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
