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
import { render } from "@testing-library/react-native";
import { type forwardRef, type useImperativeHandle } from "react";

import { BugroutMap } from "@/components/map/BugroutMap";
import { useMapStore } from "@/stores/useMapStore";

import type { DownloadedRegion } from "@bugrout/shared";

const mockMapViewProps: Record<string, unknown>[] = [];
const mockCameraProps: Record<string, unknown>[] = [];
const mockSetCamera = jest.fn();

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
      useHandle(ref, () => ({ setCamera: mockSetCamera }));
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

describe("BugroutMap", () => {
  beforeEach(() => {
    mockMapViewProps.length = 0;
    mockCameraProps.length = 0;
    mockSetCamera.mockClear();
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
