/**
 * Battery platform abstraction.
 * Falls back to "full battery" mock in Expo Go.
 */

import { Platform } from "react-native";

const EXPO_BATTERY = "expo-battery";

export /**
 *
 */
const BatteryState = {
  UNKNOWN: 0,
  UNPLUGGED: 1,
  CHARGING: 2,
  FULL: 3,
};

/**
 *
 */
export interface BatteryLevelEvent {
  batteryLevel: number;
}

/**
 *
 */
export interface BatteryStateEvent {
  batteryState: number;
}

/**
 *
 */
export interface Subscription {
  remove(): void;
}

/**
 * Returns the current battery level as a fraction from 0 to 1, falling back
 * to a mock "85%" value when expo-battery is unavailable.
 */
export async function getBatteryLevelAsync(): Promise<number> {
  if (Platform.OS === "web") {
    return 0.85; // Mock: 85%
  }
  try {
    const mod = EXPO_BATTERY;
    const Battery = require(mod);
    return await Battery.getBatteryLevelAsync();
  } catch {
    return 0.85; // Mock: 85%
  }
}

/**
 * Returns the current charging state (see {@link BatteryState}), falling back
 * to "unplugged" when expo-battery is unavailable.
 */
export async function getBatteryStateAsync(): Promise<number> {
  if (Platform.OS === "web") {
    return BatteryState.UNPLUGGED;
  }
  try {
    const mod = EXPO_BATTERY;
    const Battery = require(mod);
    return await Battery.getBatteryStateAsync();
  } catch {
    return BatteryState.UNPLUGGED;
  }
}

/**
 * Subscribes to battery-level change events; returns a no-op subscription
 * when expo-battery is unavailable.
 */
export function addBatteryLevelListener(
  callback: (event: BatteryLevelEvent) => void,
): Subscription {
  if (Platform.OS === "web") {
    return {
      remove() {
        /* no-op mock */
      },
    };
  }
  try {
    const mod = EXPO_BATTERY;
    const Battery = require(mod);
    return Battery.addBatteryLevelListener(callback);
  } catch {
    return {
      remove() {
        /* no-op mock */
      },
    };
  }
}

/**
 * Subscribes to battery charging-state change events; returns a no-op
 * subscription when expo-battery is unavailable.
 */
export function addBatteryStateListener(
  callback: (event: BatteryStateEvent) => void,
): Subscription {
  if (Platform.OS === "web") {
    return {
      remove() {
        /* no-op mock */
      },
    };
  }
  try {
    const mod = EXPO_BATTERY;
    const Battery = require(mod);
    return Battery.addBatteryStateListener(callback);
  } catch {
    return {
      remove() {
        /* no-op mock */
      },
    };
  }
}
