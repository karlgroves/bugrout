/**
 * Tests for the reduce-motion hook.
 *
 * The default matters more than it looks: this hook gates an infinite
 * animation, and starting animated-then-still would show a burst of motion to
 * someone who asked for none — and, on CI, would let Espresso miss its idle
 * window before the preference resolved.
 */

import { renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { useReducedMotion } from "@/hooks/useReducedMotion";

describe("useReducedMotion", () => {
  let removeMock: jest.Mock;

  beforeEach(() => {
    removeMock = jest.fn();
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockReturnValue({ remove: removeMock } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts reduced before the platform has answered", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockReturnValue(new Promise(() => undefined));

    const { result } = await renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it("allows motion once the platform reports the preference is off", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);

    const { result } = await renderHook(() => useReducedMotion());
    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("stays reduced when the preference is on", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);

    const { result } = await renderHook(() => useReducedMotion());
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("stays reduced when the platform query rejects", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockRejectedValue(new Error("unsupported"));

    const { result } = await renderHook(() => useReducedMotion());
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("subscribes to changes and unsubscribes on unmount", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);

    const { unmount } = await renderHook(() => useReducedMotion());
    await waitFor(() => {
      expect(AccessibilityInfo.addEventListener).toHaveBeenCalledWith(
        "reduceMotionChanged",
        expect.any(Function),
      );
    });

    await unmount();
    expect(removeMock).toHaveBeenCalled();
  });
});
