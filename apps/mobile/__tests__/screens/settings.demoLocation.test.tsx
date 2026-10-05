/**
 * The demo location switch (#205) can change only between trips: switching the
 * position source mid-trip cuts navigation off from its location feed.
 */
import { fireEvent, render, within } from "@testing-library/react-native";

import SettingsScreen from "@/app/(tabs)/settings";
import { useRouteStore } from "@/stores/useRouteStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe("Settings — demo location", () => {
  afterEach(() => {
    useSettingsStore.setState({ demoLocation: false });
    useRouteStore.setState({ status: "idle" });
  });

  it("turns on between trips", async () => {
    const screen = await render(<SettingsScreen />);
    const row = within(screen.getByTestId("settings-toggle-demo-location"));
    fireEvent(row.getByLabelText("Demo location"), "valueChange", true);
    expect(useSettingsStore.getState().demoLocation).toBe(true);
  });

  it.each(["active", "rerouting"] as const)(
    "can't be changed while a trip is %s, and says why",
    async (status) => {
      useRouteStore.setState({ status });
      const screen = await render(<SettingsScreen />);
      const row = within(screen.getByTestId("settings-toggle-demo-location"));
      expect(row.getByLabelText("Demo location")).toBeDisabled();
      expect(row.getByText(/Can't be changed during a trip/)).toBeTruthy();
    },
  );

  it("can be changed again once the trip is over", async () => {
    useRouteStore.setState({ status: "completed" });
    const screen = await render(<SettingsScreen />);
    const row = within(screen.getByTestId("settings-toggle-demo-location"));
    expect(row.getByLabelText("Demo location")).not.toBeDisabled();
  });
});
