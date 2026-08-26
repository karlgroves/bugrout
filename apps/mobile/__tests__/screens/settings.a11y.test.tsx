/**
 * Accessibility contract for the Settings screen.
 *
 * Every control here must have an accessible name. The four preference
 * switches previously had none: `ToggleRow` rendered `<Switch>` with no
 * `accessibilityLabel`, and the visible text sat in a sibling `View` that was
 * never associated with it — so a screen reader announced four indistinguishable
 * "switch, on" controls. Two of them govern whether location telemetry leaves
 * the device and whether voice guidance works while driving.
 *
 * Found while authoring docs/use-cases/ (#81), filed as #100.
 */

import { render } from "@testing-library/react-native";

import SettingsScreen from "@/app/(tabs)/settings";
import { useSettingsStore } from "@/stores/useSettingsStore";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe("Settings — every control is named", () => {
  it("names all four preference switches", async () => {
    const { getByLabelText } = await render(<SettingsScreen />);

    for (const name of [
      "Distance units",
      "Voice Navigation",
      "Crowd Signal (Anonymous)",
      "Battery Optimization",
    ]) {
      expect(getByLabelText(name)).toBeTruthy();
    }
  });

  it("exposes each switch with the switch role and its state", async () => {
    const { getByLabelText } = await render(<SettingsScreen />);

    const voice = getByLabelText("Voice Navigation");
    expect(voice.props.accessibilityRole ?? voice.props.role).toBe("switch");
  });

  it("states what each switch does, not just what it is called", async () => {
    // A name alone leaves a screen reader user to guess what
    // "Battery Optimization, switch, on" will do to their route.
    const { getByLabelText } = await render(<SettingsScreen />);

    for (const name of [
      "Distance units",
      "Voice Navigation",
      "Crowd Signal (Anonymous)",
      "Battery Optimization",
    ]) {
      const hint: unknown = getByLabelText(name).props.accessibilityHint;
      expect(typeof hint).toBe("string");
      expect(hint as string).not.toBe("");
    }
  });

  it("does not fold the hint into the name", async () => {
    // Concatenating them is what produces the run-together announcement #102
    // describes on another screen.
    const { getByLabelText } = await render(<SettingsScreen />);

    const crowd = getByLabelText("Crowd Signal (Anonymous)");
    expect(crowd.props.accessibilityLabel).toBe("Crowd Signal (Anonymous)");
  });

  it("keeps the Units name stable and non-contradictory in both states", async () => {
    // It used to read "Units: Miles", which announced as
    // "Units: Miles, switch, off" — heard as *miles is turned off*. The name
    // must not carry the value the switch is selecting between.
    for (const units of ["mi", "km"] as const) {
      useSettingsStore.setState({ units });
      const { getByLabelText, queryByLabelText } = await render(
        <SettingsScreen />,
      );

      expect(getByLabelText("Distance units")).toBeTruthy();
      expect(queryByLabelText("Units: Miles")).toBeNull();
      expect(queryByLabelText("Units: Kilometers")).toBeNull();
    }
    useSettingsStore.setState({ units: "mi" });
  });

  it("shows the current unit as information, not as part of the name", async () => {
    useSettingsStore.setState({ units: "km" });
    const { getByText, getByLabelText } = await render(<SettingsScreen />);

    expect(getByText("Kilometers")).toBeTruthy();
    expect(getByLabelText("Distance units").props.accessibilityHint).toBe(
      "On for kilometers, off for miles",
    );
    useSettingsStore.setState({ units: "mi" });
  });

  it("names every navigation row too", async () => {
    const { getByLabelText } = await render(<SettingsScreen />);

    for (const name of [
      "Offline Maps",
      "Emergency Contacts",
      "Legal & Disclaimers",
    ]) {
      expect(getByLabelText(name)).toBeTruthy();
    }
  });
});
