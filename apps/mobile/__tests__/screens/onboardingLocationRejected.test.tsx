/**
 * A permission request the OS rejects outright counts as denied (#299).
 *
 * The location shim no longer turns a rejection into a fabricated grant, so
 * the onboarding screen must treat it as a denial rather than leave an
 * unhandled rejection or carry on as if location were allowed.
 */

import { fireEvent, render } from "@testing-library/react-native";

import OnboardingScreen from "@/app/onboarding/index";
import { Events } from "@/platform/analytics";

import type * as Analytics from "@/platform/analytics";
import type * as ReactNative from "react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock("@/services/AppBootstrap", () => ({
  acceptDisclaimer: () => Promise.resolve(),
}));
jest.mock("@/services/DownloadReminder", () => ({
  scheduleDownloadReminder: () => Promise.resolve(true),
}));
jest.mock("@/platform/location", () => ({
  requestForegroundPermissionsAsync: () =>
    Promise.reject(new Error("Location request failed")),
}));

const mockTrack = jest.fn();
jest.mock("@/platform/analytics", () => {
  const actual = jest.requireActual<typeof Analytics>("@/platform/analytics");
  return {
    ...actual,
    track: (...args: unknown[]) => mockTrack(...args) as unknown,
  };
});

jest.mock("@/components/onboarding/OfflineMapStep", () => {
  const { Text } = jest.requireActual<typeof ReactNative>("react-native");
  return {
    OfflineMapStep: ({ locationGranted }: { locationGranted: boolean }) => (
      <Text>{locationGranted ? "Location granted" : "Location denied"}</Text>
    ),
  };
});

describe("onboarding — rejected location request", () => {
  it("treats the rejection as a denial and moves on", async () => {
    const screen = await render(<OnboardingScreen />);
    await fireEvent.press(screen.getByText("I Understand — Continue"));
    await fireEvent.press(await screen.findByText("Allow Location"));

    expect(await screen.findByText("Location denied")).toBeTruthy();
    expect(mockTrack).toHaveBeenCalledWith(Events.LOCATION_PERMISSION_DENIED);
    expect(mockTrack).not.toHaveBeenCalledWith(
      Events.LOCATION_PERMISSION_GRANTED,
    );
  });
});
