/**
 * The location shim on a build that ships expo-location (#299).
 *
 * A rejection from the real module — location services off, a fix that
 * times out, a permission request the OS refuses — must reach the caller. It
 * used to land in the same `catch` as "module missing" and come back as a
 * fabricated grant and a fabricated San Francisco fix.
 */

// The factory runs when the shim requires expo-location at import, before
// any top-level `const` here is initialised, so it builds its own mocks.
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  watchHeadingAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
}));

import {
  getCurrentPositionAsync,
  hasServicesEnabledAsync,
  isUsingMockLocation,
  requestBackgroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  watchHeadingAsync,
  watchPositionAsync,
} from "@/platform/location";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the jest.mock factory above
const mockLocation = require("expo-location") as Record<
  | "requestForegroundPermissionsAsync"
  | "requestBackgroundPermissionsAsync"
  | "watchPositionAsync"
  | "watchHeadingAsync"
  | "getCurrentPositionAsync"
  | "hasServicesEnabledAsync",
  jest.Mock
>;

describe("location shim with expo-location present", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("does not report positions as simulated", () => {
    expect(isUsingMockLocation()).toBe(false);
  });

  it("propagates a rejected foreground permission request", async () => {
    mockLocation.requestForegroundPermissionsAsync.mockRejectedValue(
      new Error("permission request failed"),
    );
    await expect(requestForegroundPermissionsAsync()).rejects.toThrow(
      "permission request failed",
    );
  });

  it("propagates a rejected background permission request", async () => {
    mockLocation.requestBackgroundPermissionsAsync.mockRejectedValue(
      new Error("permission request failed"),
    );
    await expect(requestBackgroundPermissionsAsync()).rejects.toThrow(
      "permission request failed",
    );
  });

  it("returns the real permission status", async () => {
    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: "denied",
    });
    await expect(requestForegroundPermissionsAsync()).resolves.toEqual({
      status: "denied",
    });
  });

  it("rejects a watch that cannot start instead of emitting a mock track", async () => {
    mockLocation.watchPositionAsync.mockRejectedValue(
      new Error("Location provider is unavailable"),
    );
    const seen: unknown[] = [];

    await expect(watchPositionAsync({}, (l) => seen.push(l))).rejects.toThrow(
      "Location provider is unavailable",
    );

    jest.advanceTimersByTime(5000);
    expect(seen).toHaveLength(0);
  });

  it("propagates a rejected heading watch", async () => {
    mockLocation.watchHeadingAsync.mockRejectedValue(new Error("no compass"));
    const seen: unknown[] = [];
    await expect(watchHeadingAsync((h) => seen.push(h))).rejects.toThrow(
      "no compass",
    );
    expect(seen).toHaveLength(0);
  });

  it("rejects a one-shot fix that times out instead of returning a mock position", async () => {
    mockLocation.getCurrentPositionAsync.mockRejectedValue(
      new Error("Location request timed out"),
    );
    await expect(getCurrentPositionAsync()).rejects.toThrow(
      "Location request timed out",
    );
  });

  it("fails closed when the services check rejects", async () => {
    mockLocation.hasServicesEnabledAsync.mockRejectedValue(new Error("boom"));
    await expect(hasServicesEnabledAsync()).resolves.toBe(false);
  });

  it("reports the real services state", async () => {
    mockLocation.hasServicesEnabledAsync.mockResolvedValue(false);
    await expect(hasServicesEnabledAsync()).resolves.toBe(false);
  });
});
