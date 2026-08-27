/**
 * Pins the handles the Detox smoke suite reaches for on the download guide.
 *
 * `navigation-flow.test.ts` dismisses this overlay before it can tap the Bug
 * Out FAB, so if the skip control loses its testID the whole flow goes red —
 * roughly 30 minutes later, on CI, in a job that needs an emulator. These
 * assertions put that failure here instead, in about a second.
 */
import { render, fireEvent } from "@testing-library/react-native";

import { DownloadGuide } from "@/components/common/DownloadGuide";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/hooks/useLocation", () => ({
  useLocation: () => ({
    position: null,
    getPosition: jest.fn(),
    locationError: null,
  }),
}));

const SKIP_TEST_ID = "download-guide-skip-btn";
const SKIP_LABEL = "Skip for now";

describe("DownloadGuide — the handles the E2E suite depends on", () => {
  it("exposes the skip control under a single, unambiguous testID", async () => {
    const { getAllByTestId } = await render(
      <DownloadGuide onDismiss={jest.fn()} />,
    );

    // Detox addresses this control by id precisely because the label is
    // ambiguous, so "exactly one" is the property that matters, not "at least
    // one" — two would fail on the emulator the same way the label did.
    expect(getAllByTestId(SKIP_TEST_ID)).toHaveLength(1);
  });

  it("keeps the accessible name that matches the visible text", async () => {
    const { getByTestId, getByText } = await render(
      <DownloadGuide onDismiss={jest.fn()} />,
    );

    // WCAG 2.5.3: the accessible name must contain the visible label. This is
    // the duplication that makes Detox's label matcher ambiguous, so it is
    // worth stating that it is deliberate and must not be "fixed" by weakening
    // the label.
    expect(getByTestId(SKIP_TEST_ID).props.accessibilityLabel).toBe(SKIP_LABEL);
    expect(getByText(SKIP_LABEL)).toBeTruthy();
  });

  it("dismisses when the skip control is pressed", async () => {
    const onDismiss = jest.fn();
    const { getByTestId } = await render(
      <DownloadGuide onDismiss={onDismiss} />,
    );

    fireEvent.press(getByTestId(SKIP_TEST_ID));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
