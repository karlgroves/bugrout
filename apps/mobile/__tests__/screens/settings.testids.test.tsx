/**
 * Settings test ids are stable.
 *
 * They used to be derived from the visible label:
 *
 *   testID={`settings-toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
 *
 * which produced two bad ids. "Crowd Signal (Anonymous)" gained a trailing
 * dash from the closing paren, and "Units: Miles" produced an id that changed
 * when the setting changed — so the Units row had no stable handle at all.
 *
 * These tests pin the ids themselves. That is unusual — normally a test id is
 * an implementation detail — but here the id being invariant across state and
 * copy changes is the property under repair.
 *
 * Filed as #103, found while authoring docs/use-cases/ (#81).
 */

import { render } from "@testing-library/react-native";

import SettingsScreen from "@/app/(tabs)/settings";
import { useSettingsStore } from "@/stores/useSettingsStore";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

const EXPECTED_IDS = [
  "settings-row-offline-maps",
  "settings-row-emergency-contacts",
  "settings-row-legal",
  "settings-toggle-units",
  "settings-toggle-voice-navigation",
  "settings-toggle-crowd-signal",
  "settings-toggle-battery-optimization",
];

describe("Settings test ids", () => {
  afterEach(() => {
    useSettingsStore.setState({ units: "mi" });
  });

  it("renders every expected id", async () => {
    const { getByTestId } = await render(<SettingsScreen />);

    for (const id of EXPECTED_IDS) {
      expect(getByTestId(id)).toBeTruthy();
    }
  });

  it("has no id with a trailing separator", async () => {
    const { getByTestId } = await render(<SettingsScreen />);

    for (const id of EXPECTED_IDS) {
      expect(getByTestId(id)).toBeTruthy();
      expect(id).not.toMatch(/-$/);
    }
  });

  it("keeps the Units id stable when the unit changes", async () => {
    // The regression: the id was derived from a label containing the current
    // value, so switching units renamed the control's handle.
    useSettingsStore.setState({ units: "mi" });
    const miles = await render(<SettingsScreen />);
    expect(miles.getByTestId("settings-toggle-units")).toBeTruthy();
    // #105 moved the current unit out of the label and into the subtitle, so
    // the value is asserted there. The point of this test is unchanged: the
    // test id must not move when the value does.
    expect(miles.getByText("Miles")).toBeTruthy();

    useSettingsStore.setState({ units: "km" });
    const km = await render(<SettingsScreen />);
    expect(km.getByTestId("settings-toggle-units")).toBeTruthy();
    expect(km.getByText("Kilometers")).toBeTruthy();
  });

  it("does not resurrect either of the old derived ids", async () => {
    const { queryByTestId } = await render(<SettingsScreen />);

    for (const stale of [
      "settings-toggle-crowd-signal-anonymous-",
      "settings-toggle-units-miles",
      "settings-toggle-units-kilometers",
    ]) {
      expect(queryByTestId(stale)).toBeNull();
    }
  });
});
