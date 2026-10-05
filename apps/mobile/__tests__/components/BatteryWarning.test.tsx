/**
 * Tests for the navigation screen's low-battery banner.
 *
 * The banner decides for itself whether to render, so the rule in #202 is
 * pinned here: an unknown level (expo-battery's -1) shows nothing, never
 * "Battery -100%".
 */

import { render } from "@testing-library/react-native";

import { BatteryWarning } from "@/components/navigation/BatteryWarning";

import type { BatteryStatus } from "@/hooks/useBattery";

/** A battery status with the given overrides on an unplugged, healthy base. */
function status(overrides: Partial<BatteryStatus>): BatteryStatus {
  return {
    level: 0.8,
    percent: 80,
    isCharging: false,
    isLow: false,
    isCritical: false,
    ...overrides,
  };
}

describe("BatteryWarning", () => {
  it("renders nothing for an unknown level", async () => {
    const screen = await render(
      <BatteryWarning battery={status({ level: null, percent: null })} />,
    );
    expect(screen.toJSON()).toBeNull();
    expect(screen.queryByText(/Battery/)).toBeNull();
  });

  it("renders nothing when the level is fine", async () => {
    const screen = await render(<BatteryWarning battery={status({})} />);
    expect(screen.toJSON()).toBeNull();
  });

  it("warns at a low level, announced as an alert", async () => {
    const screen = await render(
      <BatteryWarning
        battery={status({ level: 0.19, percent: 19, isLow: true })}
      />,
    );
    expect(screen.getByText("Battery 19%")).toBeTruthy();
    expect(
      screen.getByLabelText("Battery 19% — low").props.accessibilityRole,
    ).toBe("alert");
  });

  it("adds the crowd-signal advice when critical", async () => {
    const screen = await render(
      <BatteryWarning
        battery={status({
          level: 0.05,
          percent: 5,
          isLow: true,
          isCritical: true,
        })}
      />,
    );
    expect(
      screen.getByText("Battery 5% — Save battery: stop crowd signal"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Battery 5% — critically low")).toBeTruthy();
  });
});
