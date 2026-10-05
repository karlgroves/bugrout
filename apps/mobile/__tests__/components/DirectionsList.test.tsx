/**
 * The directions list (#192): every step readable as one item, with its
 * distance and clock time; during a trip it starts at the step being driven
 * towards; a reroute is announced.
 */

import { act, render } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { DirectionsList } from "@/components/navigation/DirectionsList";

import type { Route, RouteManeuver } from "@bugrout/shared";

/** A maneuver whose following stretch is `metres` long and takes `seconds`. */
function m(
  instruction: string,
  metres: number,
  seconds: number,
): RouteManeuver {
  return {
    type: "continue",
    instruction,
    streetName: "",
    distance: metres,
    duration: seconds,
    position: { lat: 0, lng: 0 },
    bearingAfter: 0,
  };
}

const route: Route = {
  id: "r1",
  summary: "",
  geometry: "",
  coordinates: [],
  distance: 3218,
  duration: 300,
  legs: [
    {
      distance: 3218,
      duration: 300,
      maneuvers: [
        m("Head north on Main Street", 1609, 120),
        m("Turn right onto Oak Avenue", 1609, 180),
        m("You have arrived", 0, 0),
      ],
    },
  ],
};

const NOW = new Date(2026, 9, 5, 9, 0, 0).getTime();

/** The clock time the list shows for `msFromNow` later. */
function clockIn(msFromNow: number): string {
  return new Date(NOW + msFromNow).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

describe("DirectionsList", () => {
  it("lists every step, each announced once with its distance and clock time", async () => {
    const screen = await render(<DirectionsList route={route} now={NOW} />);

    expect(
      screen.getByLabelText(
        `Turn right onto Oak Avenue, in 1.0 mi, at ${clockIn(120_000)}`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        `You have arrived, in 1.0 mi, at ${clockIn(300_000)}`,
      ),
    ).toBeTruthy();
    // The first step is reached at once, so it has no distance.
    expect(
      screen.getByLabelText(`Head north on Main Street, at ${clockIn(0)}`),
    ).toBeTruthy();
  });

  it("during a trip, starts at the next step, marks it, and shows the live distance", async () => {
    const screen = await render(
      <DirectionsList
        route={route}
        now={NOW}
        progress={{ current: 1, metresToCurrent: 804.5 }}
      />,
    );

    expect(screen.getByText("1 step done")).toBeTruthy();
    expect(screen.queryByTestId("direction-step-0")).toBeNull();
    // Half the 120 s stretch left: reached in about 60 s.
    expect(
      screen.getByLabelText(
        `Next, Turn right onto Oak Avenue, in 0.5 mi, at ${clockIn(60_000)}`,
      ),
    ).toBeTruthy();
    // Later steps follow on from it.
    expect(
      screen.getByLabelText(
        `You have arrived, in 1.0 mi, at ${clockIn(60_000 + 180_000)}`,
      ),
    ).toBeTruthy();
  });

  it("announces a reroute, and says so on screen", async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    const screen = await render(<DirectionsList route={route} now={NOW} />);
    expect(screen.queryByText("Route updated")).toBeNull();

    await screen.rerender(
      <DirectionsList route={{ ...route, id: "r2" }} now={NOW} />,
    );

    expect(screen.getByText("Route updated")).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Route updated");
    announce.mockRestore();
  });

  it("clears the notice after a few seconds", async () => {
    jest.useFakeTimers();
    const announce = jest
      .spyOn(AccessibilityInfo, "announceForAccessibility")
      .mockImplementation(() => undefined);
    const screen = await render(<DirectionsList route={route} now={NOW} />);
    await screen.rerender(
      <DirectionsList route={{ ...route, id: "r2" }} now={NOW} />,
    );
    expect(screen.getByText("Route updated")).toBeTruthy();

    await act(() => {
      jest.advanceTimersByTime(6000);
    });
    expect(screen.queryByText("Route updated")).toBeNull();
    jest.useRealTimers();
    announce.mockRestore();
  });
});
