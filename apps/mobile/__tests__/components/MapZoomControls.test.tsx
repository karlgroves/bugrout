/**
 * The zoom buttons are named, sized and stated for every user (#188).
 */

import { fireEvent, render } from "@testing-library/react-native";

import { MapZoomControls } from "@/components/map/MapZoomControls";
import { touchTarget } from "@/constants/theme";

describe("MapZoomControls", () => {
  it("names each button and calls its handler", async () => {
    const onZoomIn = jest.fn();
    const onZoomOut = jest.fn();
    const screen = await render(
      <MapZoomControls
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        canZoomIn
        canZoomOut
      />,
    );

    for (const name of ["Zoom in", "Zoom out"]) {
      const button = screen.getByLabelText(name);
      expect(button.props.accessibilityRole).toBe("button");
      expect(button).toHaveStyle({
        width: touchTarget.minWidth,
        height: touchTarget.minHeight,
      });
    }

    await fireEvent.press(screen.getByLabelText("Zoom in"));
    await fireEvent.press(screen.getByLabelText("Zoom out"));
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
  });

  it("disables, and announces as disabled, a button at its limit", async () => {
    const onZoomIn = jest.fn();
    const screen = await render(
      <MapZoomControls
        onZoomIn={onZoomIn}
        onZoomOut={jest.fn()}
        canZoomIn={false}
        canZoomOut
      />,
    );

    const zoomIn = screen.getByLabelText("Zoom in");
    expect(zoomIn.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(zoomIn);
    expect(onZoomIn).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText("Zoom out").props.accessibilityState,
    ).toMatchObject({ disabled: false });
  });
});
