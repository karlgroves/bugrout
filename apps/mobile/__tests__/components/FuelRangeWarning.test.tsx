/**
 * The fuel banner, and how it reaches a screen reader (#203).
 *
 * Spec §7.3 asks for a *non-intrusive* banner. That is the part worth testing:
 * it is announced, politely, once per crossing — it never takes the focus a
 * driver is using to follow the maneuver card.
 */
import { render, fireEvent } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { FuelRangeWarning } from "@/components/navigation/FuelRangeWarning";

import type { FuelStopAhead } from "@/services/navigation/FuelRange";
import type { ResourcePoint } from "@bugrout/shared";

const STATION: ResourcePoint = {
  id: "osm-1",
  type: "fuel",
  name: "Wawa, Route 40",
  lat: 39.0,
  lng: -76.8,
  address: null,
  metadata: {},
  source: "osm",
  fetchedAt: 0,
  regionId: "md",
};

/** 67.6 km ahead — "42.0 mi" once formatted. */
const STOP: FuelStopAhead = { resource: STATION, distanceAhead: 67593 };

/** 80.5 km of range — "50.0 mi". */
const RANGE_LEFT = 80467;

describe("FuelRangeWarning", () => {
  it("renders nothing when the threshold has not been crossed", async () => {
    const screen = await render(
      <FuelRangeWarning
        stop={STOP}
        rangeRemaining={RANGE_LEFT}
        warn={false}
        units="mi"
        onAddFuelStop={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("fuel-range-warning")).toBe(null);
  });

  it("renders nothing when the driver gave no range", async () => {
    const screen = await render(
      <FuelRangeWarning
        stop={STOP}
        rangeRemaining={null}
        warn
        units="mi"
        onAddFuelStop={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("fuel-range-warning")).toBe(null);
  });

  it("renders nothing when there is no station ahead to point at", async () => {
    const screen = await render(
      <FuelRangeWarning
        stop={null}
        rangeRemaining={RANGE_LEFT}
        warn
        units="mi"
        onAddFuelStop={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("fuel-range-warning")).toBe(null);
  });

  it("names both distances in the driver's units", async () => {
    const screen = await render(
      <FuelRangeWarning
        stop={STOP}
        rangeRemaining={RANGE_LEFT}
        warn
        units="mi"
        onAddFuelStop={jest.fn()}
      />,
    );
    expect(
      screen.getByText(
        "Fuel: next station on route in 42.0 mi — about 50.0 mi of range left",
      ),
    ).toBeTruthy();
  });

  it("follows the units setting", async () => {
    const screen = await render(
      <FuelRangeWarning
        stop={STOP}
        rangeRemaining={RANGE_LEFT}
        warn
        units="km"
        onAddFuelStop={jest.fn()}
      />,
    );
    expect(
      screen.getByText(
        "Fuel: next station on route in 67.6 km — about 80.5 km of range left",
      ),
    ).toBeTruthy();
  });

  it("announces politely rather than taking focus", async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);

    const screen = await render(
      <FuelRangeWarning
        stop={STOP}
        rangeRemaining={RANGE_LEFT}
        warn
        units="mi"
        onAddFuelStop={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId("fuel-range-warning").props.accessibilityLiveRegion,
    ).toBe("polite");
    expect(announce).toHaveBeenCalledWith(
      "Fuel: next station on route in 42.0 mi — about 50.0 mi of range left",
    );
    announce.mockRestore();
  });

  it("announces once, not on every position update", async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);

    const screen = await render(
      <FuelRangeWarning
        stop={STOP}
        rangeRemaining={RANGE_LEFT}
        warn
        units="mi"
        onAddFuelStop={jest.fn()}
      />,
    );
    await screen.rerender(
      <FuelRangeWarning
        stop={STOP}
        rangeRemaining={RANGE_LEFT}
        warn
        units="mi"
        onAddFuelStop={jest.fn()}
      />,
    );

    expect(announce).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });

  it("offers a named reroute through the station", async () => {
    const onAddFuelStop = jest.fn();
    const screen = await render(
      <FuelRangeWarning
        stop={STOP}
        rangeRemaining={RANGE_LEFT}
        warn
        units="mi"
        onAddFuelStop={onAddFuelStop}
      />,
    );

    const button = screen.getByTestId("fuel-range-add-stop-btn");
    expect(button.props.accessibilityLabel).toBe("Add fuel stop");
    expect(button.props.accessibilityHint).toBe(
      "Reroutes your trip through Wawa, Route 40",
    );

    fireEvent.press(button);
    expect(onAddFuelStop).toHaveBeenCalledTimes(1);
  });
});
