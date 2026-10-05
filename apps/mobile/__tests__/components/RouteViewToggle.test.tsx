/**
 * The Map / Directions switch (#192): one tap, 44pt, and the selected option
 * is announced.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { RouteViewToggle } from "@/components/navigation/RouteViewToggle";
import { touchTarget } from "@/constants/theme";

describe("RouteViewToggle", () => {
  it("exposes both options as tabs, with the selected one marked", async () => {
    const screen = await render(
      <RouteViewToggle value="map" onChange={jest.fn()} />,
    );

    const map = screen.getByLabelText("Map");
    const directions = screen.getByLabelText("Directions");
    expect(map.props.accessibilityRole).toBe("tab");
    expect(map.props.accessibilityState).toEqual({ selected: true });
    expect(directions.props.accessibilityState).toEqual({ selected: false });
    expect(directions).toHaveStyle({ minHeight: touchTarget.minHeight });
  });

  it("switches in one tap", async () => {
    const onChange = jest.fn();
    const screen = await render(
      <RouteViewToggle value="map" onChange={onChange} />,
    );

    await fireEvent.press(screen.getByLabelText("Directions"));
    expect(onChange).toHaveBeenCalledWith("directions");
  });
});
