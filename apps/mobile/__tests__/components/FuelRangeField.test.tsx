/**
 * The one question the fuel warning rests on (#203).
 *
 * It is optional by design: this is the three-tap bug-out flow, and a driver
 * who does not know their range must still be able to press Go.
 */
import { render, fireEvent } from "@testing-library/react-native";

import { FuelRangeField } from "@/components/routing/FuelRangeField";

describe("FuelRangeField", () => {
  it("starts blank, so skipping it is doing nothing", async () => {
    const screen = await render(
      <FuelRangeField value={null} units="mi" onChange={jest.fn()} />,
    );
    const input = screen.getByTestId("fuel-range-input");
    expect(input.props.value).toBe("");
    expect(input.props.placeholder).toBe("Optional");
  });

  it("stores miles as metres", async () => {
    const onChange = jest.fn();
    const screen = await render(
      <FuelRangeField value={null} units="mi" onChange={onChange} />,
    );
    fireEvent.changeText(screen.getByTestId("fuel-range-input"), "120");
    expect(onChange).toHaveBeenCalledWith(120 * 1609.344);
  });

  it("stores kilometres as metres", async () => {
    const onChange = jest.fn();
    const screen = await render(
      <FuelRangeField value={null} units="km" onChange={onChange} />,
    );
    fireEvent.changeText(screen.getByTestId("fuel-range-input"), "200");
    expect(onChange).toHaveBeenCalledWith(200000);
  });

  it("shows a stored range back in the driver's units", async () => {
    const screen = await render(
      <FuelRangeField value={120 * 1609.344} units="mi" onChange={jest.fn()} />,
    );
    expect(screen.getByTestId("fuel-range-input").props.value).toBe("120");
  });

  it("clearing the field clears the range", async () => {
    const onChange = jest.fn();
    const screen = await render(
      <FuelRangeField value={50000} units="mi" onChange={onChange} />,
    );
    fireEvent.changeText(screen.getByTestId("fuel-range-input"), "");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("ignores anything that is not a number", async () => {
    const onChange = jest.fn();
    const screen = await render(
      <FuelRangeField value={null} units="km" onChange={onChange} />,
    );
    fireEvent.changeText(screen.getByTestId("fuel-range-input"), "1a2b");
    expect(onChange).toHaveBeenCalledWith(12000);
  });

  it("names the units and says it can be skipped", async () => {
    const screen = await render(
      <FuelRangeField value={null} units="mi" onChange={jest.fn()} />,
    );
    const input = screen.getByTestId("fuel-range-input");
    expect(input.props.accessibilityLabel).toBe(
      "About how far can you drive on your current fuel, in miles",
    );
    expect(input.props.accessibilityHint).toContain("Leave it blank to skip");
  });
});
