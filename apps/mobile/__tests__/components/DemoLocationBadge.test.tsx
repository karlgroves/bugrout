/**
 * A simulated position must never be mistaken for a real one (#205): while the
 * demo location is on, the map and navigation screens say so.
 */
import { render } from "@testing-library/react-native";

import { DemoLocationBadge } from "@/components/common/DemoLocationBadge";
import { useSettingsStore } from "@/stores/useSettingsStore";

describe("DemoLocationBadge", () => {
  afterEach(() => {
    useSettingsStore.setState({ demoLocation: false });
  });

  it("says the position is simulated while the demo location is on", async () => {
    useSettingsStore.setState({ demoLocation: true });
    const screen = await render(<DemoLocationBadge />);
    const badge = screen.getByTestId("demo-location-badge");
    expect(badge).toHaveTextContent("DEMO LOCATION");
    expect(badge.props.accessibilityLabel).toMatch(
      /simulated in Baltimore, not where you are/,
    );
  });

  it("is short on the navigation screen but says the same thing", async () => {
    useSettingsStore.setState({ demoLocation: true });
    const screen = await render(<DemoLocationBadge compact />);
    const badge = screen.getByTestId("demo-location-badge");
    expect(badge).toHaveTextContent(/^DEMO$/);
    expect(badge.props.accessibilityLabel).toMatch(/simulated in Baltimore/);
  });

  it("is absent while it is off", async () => {
    const screen = await render(<DemoLocationBadge />);
    expect(screen.queryByTestId("demo-location-badge")).toBeNull();
  });
});
