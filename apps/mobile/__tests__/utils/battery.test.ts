/**
 * Tests for the shared battery-level rules.
 *
 * expo-battery reports -1 for an unknown level. Before #202 that read as a
 * fraction below 20%, so the navigation screen showed "Battery -100%" with the
 * critical warning.
 */

import {
  isCriticalBatteryLevel,
  isLowBatteryLevel,
  knownBatteryLevel,
} from "@/utils/battery";

describe("knownBatteryLevel", () => {
  it.each([0, 0.19, 0.2, 1])("keeps a real level (%p)", (level) => {
    expect(knownBatteryLevel(level)).toBe(level);
  });

  it.each([-1, -0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "treats %p as unknown",
    (level) => {
      expect(knownBatteryLevel(level)).toBeNull();
    },
  );
});

describe("isLowBatteryLevel", () => {
  it.each([
    [0, true],
    [0.19, true],
    [0.2, false],
    [1, false],
    [-1, false],
    [Number.NaN, false],
  ])("level %p → low %p", (level, low) => {
    expect(isLowBatteryLevel(level)).toBe(low);
  });
});

describe("isCriticalBatteryLevel", () => {
  it.each([
    [0, true],
    [0.09, true],
    [0.1, false],
    [0.19, false],
    [-1, false],
    [Number.NaN, false],
  ])("level %p → critical %p", (level, critical) => {
    expect(isCriticalBatteryLevel(level)).toBe(critical);
  });
});
