/**
 * Finishing onboarding without a download schedules the reminder (#199);
 * finishing with one running doesn't.
 */

import { fireEvent, render } from "@testing-library/react-native";

import OnboardingScreen from "@/app/onboarding/index";

import type * as ReactNative from "react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));
jest.mock("@/services/AppBootstrap", () => ({
  acceptDisclaimer: () => Promise.resolve(),
}));
jest.mock("@/platform/location", () => ({
  requestForegroundPermissionsAsync: () =>
    Promise.resolve({ status: "denied" }),
}));

const mockSchedule = jest.fn(() => Promise.resolve(true));
jest.mock("@/services/DownloadReminder", () => ({
  scheduleDownloadReminder: () => mockSchedule(),
}));

let mockStartDownload = false;
jest.mock("@/components/onboarding/OfflineMapStep", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof ReactNative>("react-native");
  return {
    OfflineMapStep: ({
      onFinish,
    }: {
      onFinish: (downloadStarted: boolean) => void;
    }) => (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onFinish(mockStartDownload);
        }}
      >
        <Text>Get Started</Text>
      </Pressable>
    ),
  };
});

/** Walk onboarding to its last step and leave it. */
async function finishOnboarding(): Promise<void> {
  const screen = await render(<OnboardingScreen />);
  await fireEvent.press(screen.getByText("I Understand — Continue"));
  await fireEvent.press(await screen.findByText("Skip for now"));
  await fireEvent.press(await screen.findByText("Get Started"));
}

beforeEach(() => {
  mockSchedule.mockClear();
  mockReplace.mockClear();
});

describe("onboarding — offline map reminder", () => {
  it("schedules the reminder when no download was started", async () => {
    mockStartDownload = false;
    await finishOnboarding();

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });

  it("doesn't schedule it when a download is running", async () => {
    mockStartDownload = true;
    await finishOnboarding();

    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)");
  });
});
