/**
 * Tests for the battery hook that drives the navigation screen's warning.
 *
 * The unknown case is the one that mattered (#202): expo-battery's -1 used to
 * come out as `percent: -100, isLow: true`, which showed "Battery -100%" with
 * the critical warning.
 */

import { renderHook, waitFor } from "@testing-library/react-native";

import { useBattery } from "@/hooks/useBattery";

const mockLevel = jest.fn<Promise<number>, []>();
const mockState = jest.fn<Promise<number>, []>();

jest.mock("@/platform/battery", () => ({
  BatteryState: { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3 },
  getBatteryLevelAsync: () => mockLevel(),
  getBatteryStateAsync: () => mockState(),
  addBatteryLevelListener: () => ({ remove: jest.fn() }),
  addBatteryStateListener: () => ({ remove: jest.fn() }),
}));

/** Render the hook with the platform reporting `level` while unplugged. */
async function batteryAt(
  level: number,
): Promise<{ current: ReturnType<typeof useBattery> }> {
  mockLevel.mockResolvedValue(level);
  mockState.mockResolvedValue(1);
  const { result } = await renderHook(() => useBattery());
  await waitFor(() => {
    expect(mockLevel).toHaveBeenCalled();
  });
  return result;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe("useBattery", () => {
  it("reports an unknown level as unknown, and not low", async () => {
    const result = await batteryAt(-1);
    await waitFor(() => {
      expect(result.current.level).toBeNull();
    });
    expect(result.current.percent).toBeNull();
    expect(result.current.isLow).toBe(false);
    expect(result.current.isCritical).toBe(false);
  });

  it.each([
    [0, 0, true, true],
    [0.19, 19, true, false],
    [0.2, 20, false, false],
    [1, 100, false, false],
  ])(
    "level %p → %p%%, low %p, critical %p",
    async (level, percent, isLow, isCritical) => {
      const result = await batteryAt(level);
      await waitFor(() => {
        expect(result.current.percent).toBe(percent);
      });
      expect(result.current.isLow).toBe(isLow);
      expect(result.current.isCritical).toBe(isCritical);
    },
  );

  it("is never low while charging", async () => {
    mockLevel.mockResolvedValue(0.05);
    mockState.mockResolvedValue(2);
    const { result } = await renderHook(() => useBattery());
    await waitFor(() => {
      expect(result.current.isCharging).toBe(true);
    });
    expect(result.current.percent).toBe(5);
    expect(result.current.isLow).toBe(false);
  });
});
