/**
 * The reminder to download offline maps (#199, spec §10): 24–48 hours after
 * onboarding ends without a download, and never once a region is downloaded.
 */

import {
  cancelDownloadReminder,
  REMINDER_DELAY_SECONDS,
  scheduleDownloadReminder,
} from "@/services/DownloadReminder";

const mockScheduleOnce = jest.fn(() => Promise.resolve(true));
const mockCancel = jest.fn(() => Promise.resolve());

jest.mock("@/platform/notifications", () => ({
  scheduleOnce: (...args: unknown[]) => mockScheduleOnce(...(args as [])),
  cancel: (...args: unknown[]) => mockCancel(...(args as [])),
}));

describe("download reminder", () => {
  it("fires inside the spec's 24–48 h window", () => {
    expect(REMINDER_DELAY_SECONDS).toBeGreaterThanOrEqual(24 * 3600);
    expect(REMINDER_DELAY_SECONDS).toBeLessThanOrEqual(48 * 3600);
  });

  it("schedules one named reminder, and cancels the same one", async () => {
    await scheduleDownloadReminder();
    await cancelDownloadReminder();

    const scheduled = mockScheduleOnce.mock.calls[0] as unknown[];
    expect(scheduled[3]).toBe(REMINDER_DELAY_SECONDS);
    expect(mockCancel).toHaveBeenCalledWith(scheduled[0]);
  });
});
