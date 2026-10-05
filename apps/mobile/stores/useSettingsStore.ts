import { create } from "zustand";

/**
 *
 */
interface SettingsState {
  units: "mi" | "km";
  voiceEnabled: boolean;
  batteryOptimization: boolean;
  crowdSignalOptIn: boolean;
  /**
   * Whether the user has agreed to send crash reports.
   *
   * Defaults to false. The bundled privacy policy says crash reports are sent
   * only with consent, and this is the value that makes that true; see
   * `services/CrashReporting.ts`.
   */
  crashReportingOptIn: boolean;
  /**
   * Whether positions come from the demo location in Baltimore instead of GPS
   * (#205), so App Review can use the Maryland-only app from anywhere.
   *
   * Never persisted: it is off at every launch, so a simulated position can't
   * outlive the session it was turned on in.
   */
  demoLocation: boolean;

  setUnits: (units: "mi" | "km") => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setBatteryOptimization: (enabled: boolean) => void;
  setCrowdSignalOptIn: (optIn: boolean) => void;
  setCrashReportingOptIn: (optIn: boolean) => void;
  setDemoLocation: (on: boolean) => void;
}

export /**
 *
 */
const useSettingsStore = create<SettingsState>((set) => ({
  units: "mi",
  voiceEnabled: true,
  batteryOptimization: true,
  crowdSignalOptIn: false,
  crashReportingOptIn: false,
  demoLocation: false,

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
  setCrashReportingOptIn: (optIn) => {
    set({ crashReportingOptIn: optIn });
  },
  setDemoLocation: (on) => {
    set({ demoLocation: on });
  },
}));
