/**
 * BugroutMap hands MapLibre the app's style, opens where the user is, and
 * reports taps (#183).
 *
 * Three defects, each invisible on screen as anything but "the map is blank":
 * - The style went to `styleURL`, a prop maplibre-react-native 10 does not
 *   have, so MapLibre drew its default demo style instead of BugRout's.
 * - The camera opened on California whenever no GPS fix had arrived by first
 *   render, and never moved once one did.
 * - Taps read `event.coordinates`, but MapView's onPress delivers a GeoJSON
 *   Point, so a tap never reached `onMapPress`.
 */
import { act, fireEvent, render } from "@testing-library/react-native";
import { type forwardRef, type useImperativeHandle } from "react";

import { BugroutMap } from "@/components/map/BugroutMap";
import { useMapStore } from "@/stores/useMapStore";

import type { DownloadedRegion } from "@bugrout/shared";

const mockMapViewProps: Record<string, unknown>[] = [];
const mockCameraProps: Record<string, unknown>[] = [];
const mockSetCamera = jest.fn();
const mockZoomTo = jest.fn();
let mockReducedMotion = false;

jest.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion,
}));

jest.mock("@/platform/maplibre", () => {
  const { forwardRef: fwd, useImperativeHandle: useHandle } =
    jest.requireActual<{
      forwardRef: typeof forwardRef;
      useImperativeHandle: typeof useImperativeHandle;
    }>("react");
  return {
    setAccessToken: jest.fn(),
    MapView: (props: Record<string, unknown> & { children?: unknown }) => {
      mockMapViewProps.push(props);
      return props.children;
    },
    Camera: fwd((props: Record<string, unknown>, ref) => {
      mockCameraProps.push(props);
      useHandle(ref, () => ({
        setCamera: mockSetCamera,
        zoomTo: mockZoomTo,
      }));
      return null;
    }),
    UserLocation: () => null,
    ShapeSource: () => null,
    LineLayer: () => null,
    UserTrackingMode: { FollowWithHeading: "compass" },
  };
});

const MARYLAND: DownloadedRegion = {
  id: "md",
  name: "Maryland",
  bbox: { west: -79.49, south: 37.89, east: -75.05, north: 39.72 },
  pmtilesPath: "file:///docs/tiles/md/md.pmtiles",
  valhallaTilesPath: "file:///docs/tiles/md/md.valhalla.tar.gz",
  downloadedAt: 0,
  sizeBytes: 145_188_267,
  version: "2026.09.28",
};
const BALTIMORE = { lat: 39.2904, lng: -76.6122 };

const lastMapViewProps = () => mockMapViewProps.at(-1) ?? {};
const firstCameraProps = () => mockCameraProps.at(0) ?? {};
const lastCameraProps = () => mockCameraProps.at(-1) ?? {};

describe("BugroutMap", () => {
  beforeEach(() => {
    mockMapViewProps.length = 0;
    mockCameraProps.length = 0;
    mockSetCamera.mockClear();
    mockZoomTo.mockClear();
    mockReducedMotion = false;
    useMapStore.setState({ activeRegion: MARYLAND });
  });

  it("passes the style through mapStyle, never styleURL", async () => {
    await render(<BugroutMap userLocation={BALTIMORE} />);

    const props = lastMapViewProps();
    expect(props).not.toHaveProperty("styleURL");
    const style = props.mapStyle as {
      sources: Record<string, { url: string }>;
    };
    expect(style.sources.openmaptiles?.url).toBe(
      "pmtiles://file:///docs/tiles/md/md.pmtiles",
    );
  });

  it("opens on the downloaded region, not California, before a GPS fix", async () => {
    await render(<BugroutMap userLocation={null} />);

    const { defaultSettings } = firstCameraProps() as {
      defaultSettings: { centerCoordinate: [number, number] };
    };
    const [lng, lat] = defaultSettings.centerCoordinate;
    expect(lng).toBeGreaterThan(MARYLAND.bbox.west);
    expect(lng).toBeLessThan(MARYLAND.bbox.east);
    expect(lat).toBeGreaterThan(MARYLAND.bbox.south);
    expect(lat).toBeLessThan(MARYLAND.bbox.north);
  });

  it("moves to the user once the first fix arrives", async () => {
    const { rerender } = await render(<BugroutMap userLocation={null} />);
    expect(mockSetCamera).not.toHaveBeenCalled();

    await rerender(<BugroutMap userLocation={BALTIMORE} />);

    expect(mockSetCamera).toHaveBeenCalledTimes(1);
    expect(mockSetCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        centerCoordinate: [BALTIMORE.lng, BALTIMORE.lat],
      }),
    );

    // Later fixes don't yank the camera back while the user pans.
    await rerender(<BugroutMap userLocation={{ lat: 39.3, lng: -76.6 }} />);
    expect(mockSetCamera).toHaveBeenCalledTimes(1);
  });

  it("does not re-centre when the fix is known at first render", async () => {
    // defaultSettings already opened on it; a setCamera would only animate
    // to the same place.
    await render(<BugroutMap userLocation={BALTIMORE} />);

    const { defaultSettings } = firstCameraProps() as {
      defaultSettings: { centerCoordinate: [number, number] };
    };
    expect(defaultSettings.centerCoordinate).toEqual([
      BALTIMORE.lng,
      BALTIMORE.lat,
    ]);
    expect(mockSetCamera).not.toHaveBeenCalled();
  });

  it("reports a tap from the GeoJSON Point MapView delivers", async () => {
    const onMapPress = jest.fn();
    await render(
      <BugroutMap userLocation={BALTIMORE} onMapPress={onMapPress} />,
    );

    const onPress = lastMapViewProps().onPress as (feature: unknown) => void;
    onPress({
      type: "Feature",
      geometry: { type: "Point", coordinates: [-76.5, 39.1] },
      properties: {},
    });

    expect(onMapPress).toHaveBeenCalledWith({ lat: 39.1, lng: -76.5 });
  });
});

describe("BugroutMap zoom buttons (#188)", () => {
  beforeEach(() => {
    mockMapViewProps.length = 0;
    mockCameraProps.length = 0;
    mockZoomTo.mockClear();
    mockReducedMotion = false;
    useMapStore.setState({ activeRegion: MARYLAND });
  });

  /**
   * Report a camera move to the map, as MapLibre does: a pinch by default, or
   * a move the app made (an animation, follow mode).
   */
  async function mapMovedTo(
    zoomLevel: number,
    isUserInteraction = true,
  ): Promise<void> {
    const onRegionDidChange = lastMapViewProps().onRegionDidChange as (
      feature: unknown,
    ) => void;
    await act(() => {
      onRegionDidChange({ properties: { zoomLevel, isUserInteraction } });
    });
  }

  it("zooms in and out one level at a time, animated", async () => {
    // Opens at street zoom (12) on a known fix.
    const screen = await render(<BugroutMap userLocation={BALTIMORE} />);

    await fireEvent.press(screen.getByLabelText("Zoom in"));
    expect(mockZoomTo).toHaveBeenLastCalledWith(13, 300);

    await fireEvent.press(screen.getByLabelText("Zoom out"));
    await fireEvent.press(screen.getByLabelText("Zoom out"));
    expect(mockZoomTo).toHaveBeenLastCalledWith(11, 300);
  });

  it("steps from wherever a pinch left the map", async () => {
    const screen = await render(<BugroutMap userLocation={BALTIMORE} />);
    await mapMovedTo(15.4);

    await fireEvent.press(screen.getByLabelText("Zoom out"));
    expect(mockZoomTo).toHaveBeenLastCalledWith(14.4, 300);
  });

  it("counts every press, even while a zoom animation is still landing", async () => {
    const screen = await render(<BugroutMap userLocation={BALTIMORE} />);

    await fireEvent.press(screen.getByLabelText("Zoom in")); // → 13
    // The first press's animation reports where it got to before the second
    // press lands. It mustn't reset the base the second press steps from.
    await mapMovedTo(12.6, false);
    await fireEvent.press(screen.getByLabelText("Zoom in")); // → 14

    expect(mockZoomTo).toHaveBeenLastCalledWith(14, 300);
  });

  it("changes zoom immediately when reduce motion is on", async () => {
    mockReducedMotion = true;
    const screen = await render(<BugroutMap userLocation={BALTIMORE} />);

    await fireEvent.press(screen.getByLabelText("Zoom in"));
    expect(mockZoomTo).toHaveBeenLastCalledWith(13, 0);
  });

  it("keeps following the user while navigating", async () => {
    const screen = await render(
      <BugroutMap userLocation={BALTIMORE} followUser />,
    );
    expect(lastCameraProps().followZoomLevel).toBe(15);

    await fireEvent.press(screen.getByLabelText("Zoom in"));

    // No zoomTo, which would drop the camera out of follow mode; the follow
    // zoom changes instead.
    expect(mockZoomTo).not.toHaveBeenCalled();
    expect(lastCameraProps().followUserLocation).toBe(true);
    expect(lastCameraProps().followZoomLevel).toBe(16);
  });

  it("starts navigation at street level, even before a GPS fix", async () => {
    // With no fix the map would open on the whole region (zoom 7); following
    // the user from there put the route out of sight (#190).
    await render(<BugroutMap userLocation={null} followUser />);

    expect(lastCameraProps().followZoomLevel).toBe(15);
  });

  it("disables each button at its limit, and gives pinch the same limits", async () => {
    const screen = await render(<BugroutMap userLocation={BALTIMORE} />);
    expect(lastCameraProps()).toMatchObject({
      minZoomLevel: 2,
      maxZoomLevel: 18,
    });

    await mapMovedTo(18);
    expect(
      screen.getByLabelText("Zoom in").props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      screen.getByLabelText("Zoom out").props.accessibilityState,
    ).toMatchObject({ disabled: false });

    await mapMovedTo(2);
    expect(
      screen.getByLabelText("Zoom out").props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });
});
