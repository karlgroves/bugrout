/**
 * Choosing a plan's destination on the map (#187).
 *
 * This is the path that needs no address and no network, so it is the one that
 * has to keep working when there is neither. Two things are pinned: the point
 * is drawn, and it reaches the editor.
 *
 * The marker is a Point layer rather than a one-coordinate route line. That is
 * not a style preference: a LineString needs two positions, so a single one is
 * invalid GeoJSON and draws nothing at all — which is how the first version of
 * this screen showed no pin.
 */
import { fireEvent, render } from "@testing-library/react-native";
import { View } from "react-native";

import PickLocationScreen from "@/app/scenarios/pick-location";
import { useScenarioStore } from "@/stores/useScenarioStore";

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
const TAPPED = { lat: 39.4, lng: -76.5 };

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/hooks/useLocation", () => ({
  useLocation: () => ({ position: BALTIMORE, heading: 0 }),
}));

/** The props the map was last rendered with. */
let lastMapProps: {
  routeCoordinates?: { lat: number; lng: number }[] | undefined;
  children?: React.ReactNode;
} | null = null;

/** Jest allows a mock factory to reach only `mock`-prefixed outer names. */
const MockHost = View;

jest.mock("@/components/map/BugroutMap", () => {
  return {
    BugroutMap: (props: {
      onMapPress?: (point: { lat: number; lng: number }) => void;
      routeCoordinates?: { lat: number; lng: number }[] | undefined;
      children?: React.ReactNode;
    }) => {
      lastMapProps = props;
      return <MockHost testID="map">{props.children}</MockHost>;
    },
  };
});

beforeEach(() => {
  mockBack.mockClear();
  lastMapProps = null;
  useScenarioStore.setState({ pickedDestination: null });
});

describe("choosing a destination on the map", () => {
  it("asks for a tap, and will not confirm before there is one", async () => {
    const screen = await render(<PickLocationScreen />);

    expect(screen.getByText("Tap the map to choose")).toBeTruthy();
    const confirm = screen.getByTestId("pick-location-confirm-btn");
    expect(confirm.props.accessibilityState).toEqual({ disabled: true });

    await fireEvent.press(confirm);
    expect(useScenarioStore.getState().pickedDestination).toBe(null);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("says no connection is needed, which is the point of this screen", async () => {
    const screen = await render(<PickLocationScreen />);
    expect(
      screen.getByText("No address needed, and this works with no connection."),
    ).toBeTruthy();
  });

  it("draws the tapped point as a child layer, not a one-coordinate line", async () => {
    const screen = await render(<PickLocationScreen />);
    expect(lastMapProps?.children).toBeFalsy();

    await fireEvent(screen.getByTestId("map"), "onMapPress", TAPPED);

    // A marker is rendered inside the map...
    expect(lastMapProps?.children).toBeTruthy();
    // ...and the route line is NOT used to carry it. One coordinate is not a
    // LineString, so that form draws nothing; this is the regression guard.
    expect(lastMapProps?.routeCoordinates).toBeUndefined();
  });

  it("hands the tapped point to the editor and closes", async () => {
    const screen = await render(<PickLocationScreen />);

    await fireEvent(screen.getByTestId("map"), "onMapPress", TAPPED);

    const confirm = screen.getByTestId("pick-location-confirm-btn");
    expect(confirm.props.accessibilityState).toEqual({ disabled: false });

    await fireEvent.press(confirm);

    expect(useScenarioStore.getState().pickedDestination).toEqual(TAPPED);
    expect(mockBack).toHaveBeenCalled();
  });

  it("shows the chosen point's coordinates once there is one", async () => {
    const screen = await render(<PickLocationScreen />);
    await fireEvent(screen.getByTestId("map"), "onMapPress", TAPPED);

    expect(screen.getByText("Destination chosen")).toBeTruthy();
    expect(screen.getByText("39.4000, -76.5000")).toBeTruthy();
  });

  it("cancelling changes nothing", async () => {
    const screen = await render(<PickLocationScreen />);
    await fireEvent(screen.getByTestId("map"), "onMapPress", TAPPED);

    await fireEvent.press(screen.getByTestId("pick-location-cancel-btn"));

    expect(useScenarioStore.getState().pickedDestination).toBe(null);
    expect(mockBack).toHaveBeenCalled();
  });
});
