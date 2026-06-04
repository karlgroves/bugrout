/**
 * Hook for battery level monitoring.
 *
 * Used to:
 * - Disable crowd signal when battery < 20%
 * - Show low-battery warning during navigation
 * - Switch to battery-saving GPS mode
 */

import { useState, useEffect } from "react";
import * as Battery from "@/platform/battery";

const LOW_BATTERY_THRESHOLD = 0.2; // 20%
const CRITICAL_BATTERY_THRESHOLD = 0.1; // 10%

export function useBattery() {
  const [level, setLevel] = useState(1.0);
  const [isCharging, setIsCharging] = useState(false);

  useEffect(() => {
    // Get initial state
    Battery.getBatteryLevelAsync().then(setLevel);
    Battery.getBatteryStateAsync().then((state) => {
      setIsCharging(state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL);
    });

    // Subscribe to changes
    const levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setLevel(batteryLevel);
    });

    const stateSub = Battery.addBatteryStateListener(({ batteryState }) => {
      setIsCharging(
        batteryState === Battery.BatteryState.CHARGING ||
        batteryState === Battery.BatteryState.FULL,
      );
    });

    return () => {
      levelSub.remove();
      stateSub.remove();
    };
  }, []);

  return {
    level, // 0.0 - 1.0
    percent: Math.round(level * 100),
    isCharging,
    isLow: level < LOW_BATTERY_THRESHOLD && !isCharging,
    isCritical: level < CRITICAL_BATTERY_THRESHOLD && !isCharging,
  };
}
