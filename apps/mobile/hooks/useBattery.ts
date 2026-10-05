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
import {
  isCriticalBatteryLevel,
  isLowBatteryLevel,
  knownBatteryLevel,
} from "@/utils/battery";

/**
 * Reactive battery status derived from the platform battery module.
 */
export interface BatteryStatus {
  /** Battery level from 0.0 to 1.0, or `null` when the platform can't tell. */
  level: number | null;
  /** Battery level as an integer percentage, or `null` when unknown. */
  percent: number | null;
  /** Whether the device is currently charging or full. */
  isCharging: boolean;
  /** True when known, below the low threshold and not charging. */
  isLow: boolean;
  /** True when known, below the critical threshold and not charging. */
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

  const known = knownBatteryLevel(level);
  return {
    level: known,
    percent: known === null ? null : Math.round(known * 100),
    isCharging,
    isLow: isLowBatteryLevel(level) && !isCharging,
    isCritical: isCriticalBatteryLevel(level) && !isCharging,
  };
}
