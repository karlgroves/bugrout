/**
 * Battery-level rules shared by the navigation warning and Crowd Signal.
 *
 * `expo-battery` reports **-1** when the level is unknown (the iOS simulator,
 * and some Android devices and states). Read as a fraction, -1 is "below 20%",
 * so passing it through showed "Battery -100%" with the critical warning.
 * Anything outside 0–1 is therefore treated as unknown, and an unknown level
 * is never low.
 */

/** Below this fraction the battery counts as low (spec §7.1). */
const LOW_BATTERY_THRESHOLD = 0.2;

/** Below this fraction the battery counts as critically low. */
const CRITICAL_BATTERY_THRESHOLD = 0.1;

/**
 * The battery level if the platform actually knows it.
 *
 * @param level - A level as reported by the platform.
 * @returns The level as a 0–1 fraction, or `null` when it is unknown: -1,
 *   NaN, or anything else outside 0–1.
 */
export function knownBatteryLevel(level: number): number | null {
  return Number.isFinite(level) && level >= 0 && level <= 1 ? level : null;
}

/**
 * Whether a reported level is known and below {@link LOW_BATTERY_THRESHOLD}.
 *
 * @param level - A level as reported by the platform.
 * @returns `false` for an unknown level.
 */
export function isLowBatteryLevel(level: number): boolean {
  const known = knownBatteryLevel(level);
  return known !== null && known < LOW_BATTERY_THRESHOLD;
}

/**
 * Whether a reported level is known and below
 * {@link CRITICAL_BATTERY_THRESHOLD}.
 *
 * @param level - A level as reported by the platform.
 * @returns `false` for an unknown level.
 */
export function isCriticalBatteryLevel(level: number): boolean {
  const known = knownBatteryLevel(level);
  return known !== null && known < CRITICAL_BATTERY_THRESHOLD;
}
