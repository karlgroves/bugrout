/**
 * WCAG 2.5.3 (Label in Name) for the onboarding controls.
 *
 * Each of these buttons carries an explicit accessibilityLabel, and each had a
 * name that described the action instead of repeating the words on the button
 * ("Accept disclaimer and continue" over "I Understand — Continue"). Speech
 * input drives the visible words, so a user saying what they can see could not
 * activate any of them.
 *
 * The descriptive wording still exists — it moved to accessibilityHint, which
 * is supplementary and does not have to match the visible text.
 */
import {
  render,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react-native";

import OnboardingScreen from "@/app/onboarding/index";

const mockRequestPermissions = jest.fn<Promise<{ status: string }>, []>();

jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock("@/platform/analytics", () => ({ track: jest.fn(), Events: {} }));
jest.mock("@/platform/location", () => ({
  requestForegroundPermissionsAsync: () => mockRequestPermissions(),
}));
jest.mock("@/services/AppBootstrap", () => ({ acceptDisclaimer: jest.fn() }));

describe("Onboarding — accessible names contain the visible label (WCAG 2.5.3)", () => {
  beforeEach(() => {
    mockRequestPermissions.mockResolvedValue({ status: "granted" });
  });

  it("names the disclaimer button after the words on it", async () => {
    const { getByLabelText } = await render(<OnboardingScreen />);

    // Label in Name, stated directly: the control addressable by this
    // accessible name is the same control that visibly shows those words.
    const visible = "I Understand — Continue";
    expect(within(getByLabelText(visible)).getByText(visible)).toBeTruthy();
  });

  it("names the skip-location button after the words on it", async () => {
    const { getByText, getByLabelText } = await render(<OnboardingScreen />);
    // Accepting the disclaimer awaits acceptDisclaimer() before advancing the
    // step, so the next view is not rendered synchronously.
    fireEvent.press(getByText("I Understand — Continue"));
    await waitFor(() => getByText("Skip for now"));

    // Label in Name, stated directly: the control addressable by this
    // accessible name is the same control that visibly shows those words.
    const visible = "Skip for now";
    expect(within(getByLabelText(visible)).getByText(visible)).toBeTruthy();
  });

  it("names the finish button after the words on it", async () => {
    const { getByText, getByLabelText } = await render(<OnboardingScreen />);
    fireEvent.press(getByText("I Understand — Continue"));
    await waitFor(() => getByText("Skip for now"));
    fireEvent.press(getByText("Skip for now"));
    await waitFor(() => getByText("Get Started"));

    // Label in Name, stated directly: the control addressable by this
    // accessible name is the same control that visibly shows those words.
    const visible = "Get Started";
    expect(within(getByLabelText(visible)).getByText(visible)).toBeTruthy();
  });
});
