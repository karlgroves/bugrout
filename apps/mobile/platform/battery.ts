/**
 * Battery platform abstraction.
 * Falls back to "full battery" mock in Expo Go.
 */

import { Platform } from "react-native";

export const BatteryState = {
  UNKNOWN: 0,
  UNPLUGGED: 1,
  CHARGING: 2,
  FULL: 3,
};

export interface BatteryLevelEvent {
  batteryLevel: number;
}

export interface BatteryStateEvent {
  batteryState: number;
}

export interface Subscription {
  remove(): void;
}

export async function getBatteryLevelAsync(): Promise<number> {
  if (Platform.OS === "web") {
    return 0.85; // Mock: 85%
  }
  try {
    const mod = "expo-battery";
    const Battery = require(mod);
    return Battery.getBatteryLevelAsync();
  } catch {
    return 0.85; // Mock: 85%
  }
}

export async function getBatteryStateAsync(): Promise<number> {
  if (Platform.OS === "web") {
    return BatteryState.UNPLUGGED;
  }
  try {
    const mod = "expo-battery";
    const Battery = require(mod);
    return Battery.getBatteryStateAsync();
  } catch {
    return BatteryState.UNPLUGGED;
  }
}

export function addBatteryLevelListener(
  callback: (event: BatteryLevelEvent) => void,
): Subscription {
  if (Platform.OS === "web") {
    return { remove() {} };
  }
  try {
    const mod = "expo-battery";
    const Battery = require(mod);
    return Battery.addBatteryLevelListener(callback);
  } catch {
    return { remove() {} };
  }
}

export function addBatteryStateListener(
  callback: (event: BatteryStateEvent) => void,
): Subscription {
  if (Platform.OS === "web") {
    return { remove() {} };
  }
  try {
    const mod = "expo-battery";
    const Battery = require(mod);
    return Battery.addBatteryStateListener(callback);
  } catch {
    return { remove() {} };
  }
}
