/**
 * Pins the reduced-motion guard on the Bug Out FAB's pulse (issue #109).
 *
 * The guard is invisible to every other kind of assertion available here.
 * Under the reanimated jest mock the animation never actually runs, so the
 * FAB's rendered transform reads `scale: 1` whether the pulse was started or
 * not — the style cannot tell the two branches apart. What *does* differ is
 * which reanimated call the effect makes, so that is what these tests watch.
 *
 * The factory spreads the library's own `mock` entry point rather than
 * `requireActual`, which pulls in the native module and fails to load. That
 * keeps every other reanimated hook working while replacing only the calls
 * under assertion.
 */

import { act, render } from "@testing-library/react-native";
import * as Reanimated from "react-native-reanimated";

import MapScreen from "@/app/(tabs)/index";

import type * as ReactNamespace from "react";

jest.mock("react-native-reanimated", () => {
  const react = jest.requireActual<typeof ReactNamespace>("react");
  const base = jest.requireActual<Record<string, unknown>>(
    "react-native-reanimated/mock",
  );
  const created: { value: unknown }[] = [];
  return {
    ...base,
    __esModule: true,
    // The shipped mock returns a fresh object from every useSharedValue call.
    // That makes the effect re-run on every render no matter what its
    // dependency array says, which would let a dropped `reducedMotion`
    // dependency slip past the mid-session test below. Backing it with a ref
    // restores the referential stability the real hook has.
    useSharedValue: (initial: unknown) => {
      const ref = react.useRef<{ value: unknown } | null>(null);
      if (ref.current === null) {
        ref.current = { value: initial };
        created.push(ref.current);
      }
      return ref.current;
    },
    // Lets the tests read the value the screen is actually holding.
    __createdSharedValues: created,
    withRepeat: jest.fn((animation: unknown) => animation),
    cancelAnimation: jest.fn(),
  };
});

const mockReducedMotion = jest.fn<boolean, []>();
const mockGetPosition = jest.fn().mockResolvedValue(null);

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion(),
}));
jest.mock("@/hooks/useLocation", () => ({
  useLocation: () => ({
    position: null,
    getPosition: mockGetPosition,
    locationError: null,
  }),
}));
jest.mock("@/hooks/useDataSync", () => ({ useDataSync: jest.fn() }));
jest.mock("@/components/map/BugroutMap", () => ({ BugroutMap: () => null }));
jest.mock("@/components/map/ThreatOverlay", () => ({
  ThreatOverlay: () => null,
}));
jest.mock("@/components/map/ResourceMarkers", () => ({
  ResourceMarkers: () => null,
}));
jest.mock("@/components/map/ScenarioChips", () => ({
  ScenarioChips: () => null,
}));
jest.mock("@/components/map/ResourceFilterBar", () => ({
  ResourceFilterBar: () => null,
}));
jest.mock("@/services/tiles/TileManager", () => ({
  isRegionStale: () => false,
}));
jest.mock("@/platform/haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {},
}));

const FAB_LABEL = "Bug Out — set evacuation destination";

/** `withRepeat(animation, repeatCount)` — the repeat count is what matters. */
const mockWithRepeat = Reanimated.withRepeat as unknown as jest.Mock<
  unknown,
  [unknown, number]
>;
const mockCancelAnimation = Reanimated.cancelAnimation as unknown as jest.Mock;

const testHooks = Reanimated as unknown as {
  __createdSharedValues: { value: unknown }[];
};

/**
 * The scale value the screen is currently holding for the FAB.
 *
 * The list is cleared before each test, and the map screen creates exactly one
 * shared value per mount, so a length other than 1 means this accessor is no
 * longer reading what it claims to. Assert that rather than silently indexing
 * into whatever happens to be last.
 */
function fabScaleValue(): unknown {
  const values = testHooks.__createdSharedValues;
  expect(values).toHaveLength(1);
  return values[0]?.value;
}

describe("Bug Out FAB pulse honours the reduced-motion preference", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testHooks.__createdSharedValues.length = 0;
  });

  it("starts no animation when the system asks for reduced motion", async () => {
    mockReducedMotion.mockReturnValue(true);
    const { getByLabelText } = await render(<MapScreen />);

    expect(getByLabelText(FAB_LABEL)).toBeTruthy();
    expect(mockWithRepeat).not.toHaveBeenCalled();
    expect(mockCancelAnimation).toHaveBeenCalled();
  });

  it("starts an unending pulse when reduced motion is not requested", async () => {
    mockReducedMotion.mockReturnValue(false);
    const { getByLabelText } = await render(<MapScreen />);

    expect(getByLabelText(FAB_LABEL)).toBeTruthy();
    expect(mockWithRepeat).toHaveBeenCalledTimes(1);
    // -1 is the repeat count that makes the pulse unending, and an unending
    // pulse is the whole reason the guard exists (WCAG 2.3.3). The test names
    // the value rather than accepting any repeat count.
    expect(mockWithRepeat.mock.calls[0]?.[1]).toBe(-1);
  });

  it("cancels a running pulse when the preference turns on mid-session", async () => {
    mockReducedMotion.mockReturnValue(false);
    const { rerender } = await render(<MapScreen />);
    expect(mockWithRepeat).toHaveBeenCalledTimes(1);

    // Cleared first, so the assertions below speak only about what the
    // preference change itself caused — not about the mount before it.
    mockWithRepeat.mockClear();
    mockCancelAnimation.mockClear();

    mockReducedMotion.mockReturnValue(true);
    await rerender(<MapScreen />);

    // The effect re-ran on the changed preference, took the guarded branch,
    // and did not restart the pulse.
    expect(mockCancelAnimation).toHaveBeenCalled();
    expect(mockWithRepeat).not.toHaveBeenCalled();
    // Cancelling alone would leave the scale frozen wherever the pulse had
    // reached; the guard also has to put it back to rest.
    expect(fabScaleValue()).toBe(1);
  });

  it("cancels the pulse when the screen unmounts", async () => {
    mockReducedMotion.mockReturnValue(false);
    const { unmount } = await render(<MapScreen />);
    expect(mockWithRepeat).toHaveBeenCalledTimes(1);

    mockCancelAnimation.mockClear();
    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    // Without the cleanup the unending animation outlives the screen.
    expect(mockCancelAnimation).toHaveBeenCalled();
  });
});
