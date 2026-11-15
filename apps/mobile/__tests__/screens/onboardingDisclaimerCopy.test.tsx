/**
 * The first-launch disclaimer's wording (#285).
 *
 * It told the user route suggestions were "based on statistical models". The
 * ELF congestion model is applied to no route (#195), so the one sentence the
 * user is asked to acknowledge before using an evacuation app described a
 * capability the build does not have.
 */
import { render } from "@testing-library/react-native";

import OnboardingScreen from "@/app/onboarding/index";

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock("@/platform/analytics", () => ({ track: jest.fn(), Events: {} }));
jest.mock("@/platform/location", () => ({
  requestForegroundPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ status: "granted" }),
}));
jest.mock("@/services/AppBootstrap", () => ({ acceptDisclaimer: jest.fn() }));

describe("Onboarding disclaimer — what it claims routes are based on", () => {
  it("no longer says the suggestions come from statistical models", async () => {
    const { queryByText } = await render(<OnboardingScreen />);
    expect(queryByText(/statistical model/i)).toBeNull();
  });

  it("names map data and cached threat information instead", async () => {
    const { getByText } = await render(<OnboardingScreen />);
    expect(
      getByText(/based on map data and cached threat information/),
    ).toBeTruthy();
  });
});
