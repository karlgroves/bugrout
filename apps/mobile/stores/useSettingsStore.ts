import { create } from "zustand";

/**
 *
 */
interface SettingsState {
  units: "mi" | "km";
  voiceEnabled: boolean;
  batteryOptimization: boolean;
  crowdSignalOptIn: boolean;

  setUnits: (units: "mi" | "km") => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setBatteryOptimization: (enabled: boolean) => void;
  setCrowdSignalOptIn: (optIn: boolean) => void;
}

export /**
 *
 */
const useSettingsStore = create<SettingsState>((set) => ({
  units: "mi",
  voiceEnabled: true,
  batteryOptimization: true,
  crowdSignalOptIn: false,

  setUnits: (units) => {
    set({ units });
  },
  setVoiceEnabled: (enabled) => {
    set({ voiceEnabled: enabled });
  },
  setBatteryOptimization: (enabled) => {
    set({ batteryOptimization: enabled });
  },
  setCrowdSignalOptIn: (optIn) => {
    set({ crowdSignalOptIn: optIn });
  },
}));
