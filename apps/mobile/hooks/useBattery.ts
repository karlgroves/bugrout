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

/**
 * Reactive battery status derived from the platform battery module.
 */
export interface BatteryStatus {
  /** Battery level from 0.0 to 1.0. */
  level: number;
  /** Battery level as an integer percentage. */
  percent: number;
  /** Whether the device is currently charging or full. */
  isCharging: boolean;
  /** True when below the low threshold and not charging. */
  isLow: boolean;
  /** True when below the critical threshold and not charging. */
  isCritical: boolean;
}

/**
 * Monitors battery level and charging state for battery-aware features.
 */
export function useBattery(): BatteryStatus {
  const [level, setLevel] = useState(1.0);
  const [isCharging, setIsCharging] = useState(false);

  useEffect(() => {
    // Get initial state
    void Battery.getBatteryLevelAsync()
      .then(setLevel)
      .catch(() => {
        /* noop: initial battery level is best-effort */
      });
    void Battery.getBatteryStateAsync()
      .then((state) => {
        setIsCharging(
          state === Battery.BatteryState.CHARGING ||
            state === Battery.BatteryState.FULL,
        );
      })
      .catch(() => {
        /* noop: initial charging state is best-effort */
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
