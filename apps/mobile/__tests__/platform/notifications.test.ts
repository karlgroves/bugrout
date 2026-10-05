/**
 * Tests for the local-notifications shim (#199).
 *
 * It schedules only with the user's permission, and fails safe (nothing
 * scheduled, nothing thrown) when the native module is missing.
 */

const mockRequestPermissions = jest.fn();
const mockSchedule = jest.fn<Promise<string>, [unknown]>(() =>
  Promise.resolve("id"),
);
const mockCancelScheduled = jest.fn<Promise<void>, [string]>(() =>
  Promise.resolve(),
);

jest.mock("expo-notifications", () => ({
  requestPermissionsAsync: () => mockRequestPermissions() as unknown,
  scheduleNotificationAsync: (request: unknown) => mockSchedule(request),
  cancelScheduledNotificationAsync: (id: string) => mockCancelScheduled(id),
}));

import { cancel, scheduleOnce } from "@/platform/notifications";

beforeEach(() => {
  mockSchedule.mockClear();
  mockCancelScheduled.mockClear();
});

describe("notifications shim", () => {
  it("schedules a one-off notification once permission is granted", async () => {
    mockRequestPermissions.mockResolvedValue({ granted: true });

    expect(await scheduleOnce("r", "Title", "Body", 3600)).toBe(true);
    expect(mockSchedule).toHaveBeenCalledWith({
      identifier: "r",
      content: { title: "Title", body: "Body" },
      trigger: { type: "timeInterval", seconds: 3600, repeats: false },
    });
  });

  it("schedules nothing without permission", async () => {
    mockRequestPermissions.mockResolvedValue({ granted: false });

    expect(await scheduleOnce("r", "Title", "Body", 3600)).toBe(false);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("swallows a native failure", async () => {
    mockRequestPermissions.mockRejectedValue(new Error("no module"));

    expect(await scheduleOnce("r", "Title", "Body", 3600)).toBe(false);
    await expect(cancel("r")).resolves.toBeUndefined();
  });
});
