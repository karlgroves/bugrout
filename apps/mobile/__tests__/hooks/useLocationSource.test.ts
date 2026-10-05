/**
 * Switching the position source never shows the old source's last fix (#205).
 *
 * Turning the demo location on restarts tracking, but until the demo's first
 * fix arrives the last fix is the device's real one — Cupertino, for a
 * reviewer. The map used to draw the demo dot there and centre on it, then
 * leave the camera behind when the demo moved to Baltimore.
 */
import { act, renderHook } from "@testing-library/react-native";

import { useLocation } from "@/hooks/useLocation";
import { useSettingsStore } from "@/stores/useSettingsStore";

import type { LocationUpdate } from "@/services/location/LocationTracker";

let mockEmit: ((update: LocationUpdate) => void) | null = null;
jest.mock("@/services/location/LocationTracker", () => ({
  startTracking: (onUpdate: (update: LocationUpdate) => void) => {
    mockEmit = onUpdate;
    return Promise.resolve();
  },
  stopTracking: () => Promise.resolve(),
  getCurrentPosition: jest.fn(),
}));

/** A fix at a latitude. */
function fix(lat: number): LocationUpdate {
  return {
    position: { lat, lng: -76.6 },
    heading: 0,
    speed: 0,
    accuracy: 5,
    timestamp: 0,
  };
}

describe("useLocation across a change of source", () => {
  afterEach(() => {
    useSettingsStore.setState({ demoLocation: false });
  });

  it("drops the real fix when the demo comes on, until the demo's own arrives", async () => {
    const { result } = await renderHook(() => useLocation(true));
    await act(async () => {
      mockEmit?.(fix(37.3));
      await Promise.resolve();
    });
    expect(result.current.position?.lat).toBe(37.3);

    await act(async () => {
      useSettingsStore.setState({ demoLocation: true });
      await Promise.resolve();
    });
    expect(result.current.position).toBeNull();

    await act(async () => {
      mockEmit?.(fix(39.29));
      await Promise.resolve();
    });
    expect(result.current.position?.lat).toBe(39.29);
  });

  it("drops the demo fix when the demo goes off", async () => {
    useSettingsStore.setState({ demoLocation: true });
    const { result } = await renderHook(() => useLocation(true));
    await act(async () => {
      mockEmit?.(fix(39.29));
      await Promise.resolve();
    });
    expect(result.current.position?.lat).toBe(39.29);

    await act(async () => {
      useSettingsStore.setState({ demoLocation: false });
      await Promise.resolve();
    });
    expect(result.current.position).toBeNull();
  });
});
