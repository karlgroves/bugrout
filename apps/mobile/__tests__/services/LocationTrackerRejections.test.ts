/**
 * LocationTracker when the real location module rejects (#299).
 *
 * The platform shim now lets a rejection through instead of substituting a
 * fabricated grant or a mock position, so the tracker must surface it — and
 * must not let a compass that cannot start block position tracking.
 */
import {
  startTracking,
  stopTracking,
} from "@/services/location/LocationTracker";
import { useSettingsStore } from "@/stores/useSettingsStore";

const mockRequestForeground = jest.fn();
const mockWatchPosition = jest.fn();
const mockWatchHeading = jest.fn();

jest.mock("@/platform/location", () => ({
  Accuracy: { High: 4, BestForNavigation: 6 },
  requestForegroundPermissionsAsync: (...args: unknown[]) =>
    mockRequestForeground(...args) as unknown,
  requestBackgroundPermissionsAsync: () =>
    Promise.resolve({ status: "denied" }),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: (...args: unknown[]) =>
    mockWatchPosition(...args) as unknown,
  watchHeadingAsync: (...args: unknown[]) =>
    mockWatchHeading(...args) as unknown,
}));

describe("startTracking with a rejecting location module", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ demoLocation: false });
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await stopTracking();
    jest.restoreAllMocks();
  });

  it("rejects when the permission request rejects", async () => {
    mockRequestForeground.mockRejectedValue(new Error("request failed"));

    await expect(startTracking(jest.fn())).rejects.toThrow("request failed");
    expect(mockWatchPosition).not.toHaveBeenCalled();
  });

  it("rejects when the position watch cannot start, and stops the compass", async () => {
    const removeHeading = jest.fn();
    mockRequestForeground.mockResolvedValue({ status: "granted" });
    mockWatchHeading.mockResolvedValue({ remove: removeHeading });
    mockWatchPosition.mockRejectedValue(
      new Error("Location provider is unavailable"),
    );

    await expect(startTracking(jest.fn())).rejects.toThrow(
      "Location provider is unavailable",
    );
    // Removed by startTracking itself, not left for a later stopTracking().
    expect(removeHeading).toHaveBeenCalledTimes(1);
  });

  it("still tracks position when the compass cannot start", async () => {
    mockRequestForeground.mockResolvedValue({ status: "granted" });
    mockWatchHeading.mockRejectedValue(new Error("no magnetometer"));
    mockWatchPosition.mockResolvedValue({ remove: jest.fn() });

    await expect(startTracking(jest.fn())).resolves.toBeUndefined();
    expect(mockWatchPosition).toHaveBeenCalledTimes(1);
  });
});
