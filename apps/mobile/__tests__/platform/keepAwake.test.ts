/**
 * Tests for the keep-awake platform shim.
 *
 * It forwards one tag to expo-keep-awake on native, and fails safe (the screen
 * simply locks as normal) when the module is missing, as in Expo Go.
 */

const mockActivateKeepAwakeAsync = jest.fn<Promise<void>, [string]>();
const mockDeactivateKeepAwake = jest.fn<Promise<void>, [string]>();

jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: (tag: string) => mockActivateKeepAwakeAsync(tag),
  deactivateKeepAwake: (tag: string) => mockDeactivateKeepAwake(tag),
}));

import { activate, deactivate } from "@/platform/keepAwake";

beforeEach(() => {
  mockActivateKeepAwakeAsync.mockReset().mockResolvedValue(undefined);
  mockDeactivateKeepAwake.mockReset().mockResolvedValue(undefined);
});

describe("keepAwake shim", () => {
  it("activates and releases expo-keep-awake under the caller's tag", async () => {
    await activate("trip");
    await deactivate("trip");

    expect(mockActivateKeepAwakeAsync).toHaveBeenCalledWith("trip");
    expect(mockDeactivateKeepAwake).toHaveBeenCalledWith("trip");
  });

  it("swallows a failure from the native module", async () => {
    mockActivateKeepAwakeAsync.mockRejectedValue(new Error("no activity"));
    mockDeactivateKeepAwake.mockRejectedValue(new Error("not held"));

    await expect(activate("trip")).resolves.toBeUndefined();
    await expect(deactivate("trip")).resolves.toBeUndefined();
  });
});
