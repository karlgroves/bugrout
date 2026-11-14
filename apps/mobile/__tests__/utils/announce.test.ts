/**
 * The announcement rule lives in one place so it can be held there (#383).
 *
 * Every imperative screen-reader announcement in the app goes through
 * `announcePolitely`, so these cases are what stops a second unqueued
 * `announceForAccessibility` creeping back in: on iOS a plain announcement
 * interrupts speech in progress, and the navigation screen has two components
 * that announce while the vehicle is moving.
 */

import { AccessibilityInfo, Platform } from "react-native";

import { announcePolitely } from "@/utils/announce";

/** The queued call. React Native's jest preset already mocks these, so the
 * calls accumulate across tests unless cleared. */
function spyOnQueued(): jest.SpyInstance<
  void,
  [string, { queue?: boolean | undefined }]
> {
  const spy = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(jest.fn());
  spy.mockClear();
  return spy;
}

/** The plain, interrupting call. */
function spyOnPlain(): jest.SpyInstance<void, [string]> {
  const spy = jest
    .spyOn(AccessibilityInfo, "announceForAccessibility")
    .mockImplementation(jest.fn());
  spy.mockClear();
  return spy;
}

describe("announcePolitely", () => {
  it("queues on native, so it cannot cut off an announcement in progress", () => {
    const queued = spyOnQueued();
    const plain = spyOnPlain();

    announcePolitely("Route updated");

    expect(queued).toHaveBeenCalledTimes(1);
    expect(queued).toHaveBeenCalledWith("Route updated", { queue: true });
    expect(plain).not.toHaveBeenCalled();

    queued.mockRestore();
    plain.mockRestore();
  });

  it("uses the plain call on web, which has no queued one", () => {
    // react-native-web's AccessibilityInfo has no
    // announceForAccessibilityWithOptions at all: calling it throws and takes
    // the web preview down. The alert role does the announcing in a browser.
    const os = jest.replaceProperty(Platform, "OS", "web");
    const queued = spyOnQueued();
    const plain = spyOnPlain();

    announcePolitely("Route updated");

    expect(queued).not.toHaveBeenCalled();
    expect(plain).toHaveBeenCalledTimes(1);
    expect(plain).toHaveBeenCalledWith("Route updated");

    queued.mockRestore();
    plain.mockRestore();
    os.restore();
  });

  it("says nothing when there is nothing to say", () => {
    const queued = spyOnQueued();
    const plain = spyOnPlain();

    announcePolitely("");

    expect(queued).not.toHaveBeenCalled();
    expect(plain).not.toHaveBeenCalled();

    queued.mockRestore();
    plain.mockRestore();
  });
});
