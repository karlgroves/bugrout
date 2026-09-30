/**
 * Tests for the MapLibre platform shim's mock fallback.
 *
 * The native module is mocked as unresolvable so the `catch` path runs — the
 * same path web preview and Expo Go take. The placeholder map has to deliver
 * taps in the shape the real MapView does (a GeoJSON Point), because
 * BugroutMap reads only that: the placeholder used to send the old
 * `{ coordinates }` event, and a tap on it threw instead of reaching
 * `onMapPress` (#183).
 */

jest.mock("@maplibre/maplibre-react-native", () => {
  throw new Error("@maplibre/maplibre-react-native unavailable");
});

import { fireEvent, render } from "@testing-library/react-native";

import { BugroutMap } from "@/components/map/BugroutMap";

describe("MapLibre mock fallback", () => {
  it("delivers a tap on the placeholder map to onMapPress", async () => {
    const onMapPress = jest.fn();
    const screen = await render(
      <BugroutMap userLocation={null} onMapPress={onMapPress} />,
    );

    // The label's box sits inside the placeholder, which owns onTouchEnd.
    const placeholder = screen.getByText("Map Preview").parent?.parent;
    if (!placeholder) throw new Error("placeholder map not rendered");
    fireEvent(placeholder, "touchEnd");

    expect(onMapPress).toHaveBeenCalledWith({
      lat: 37.7749,
      lng: -122.4194,
    });
  });
});
