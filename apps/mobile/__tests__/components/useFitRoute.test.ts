/**
 * A drawn route is framed on the map, once, and not while the camera is
 * following the driver (#190).
 */
import { renderHook } from "@testing-library/react-native";

import { useFitRoute } from "@/components/map/useFitRoute";
import { LOCATED_ZOOM } from "@/services/map/cameraStart";
import { ROUTE_FIT_PADDING } from "@/services/map/routeBounds";

import type { CameraRef } from "@/platform/maplibre";

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
const HAGERSTOWN = { lat: 39.6418, lng: -77.7199 };
const ROUTE = [BALTIMORE, { lat: 39.4, lng: -77.0 }, HAGERSTOWN];
const OTHER_ROUTE = [BALTIMORE, { lat: 38.9784, lng: -76.4922 }];

/** A camera whose calls are recorded. */
function fakeCamera() {
  const fitBounds = jest.fn();
  const setCamera = jest.fn();
  return {
    fitBounds,
    setCamera,
    ref: { current: { fitBounds, setCamera } as unknown as CameraRef },
  };
}

describe("useFitRoute", () => {
  it("frames the whole route, with padding, when a route is drawn", async () => {
    const camera = fakeCamera();

    await renderHook(() => useFitRoute(camera.ref, ROUTE, false, false));

    expect(camera.fitBounds).toHaveBeenCalledTimes(1);
    expect(camera.fitBounds).toHaveBeenCalledWith(
      [-76.6122, 39.6418],
      [-77.7199, 39.2904],
      ROUTE_FIT_PADDING,
      expect.any(Number),
    );
  });

  it("does not move the camera when there is no route", async () => {
    const camera = fakeCamera();

    await renderHook(() => useFitRoute(camera.ref, [], false, false));

    expect(camera.fitBounds).not.toHaveBeenCalled();
    expect(camera.setCamera).not.toHaveBeenCalled();
  });

  it("leaves the camera alone while it follows the driver", async () => {
    const camera = fakeCamera();

    // followUser: during navigation the map is at street level on the driver,
    // and pulling out to the whole route would undo that.
    await renderHook(() => useFitRoute(camera.ref, ROUTE, true, false));

    expect(camera.fitBounds).not.toHaveBeenCalled();
    expect(camera.setCamera).not.toHaveBeenCalled();
  });

  it("does not re-frame an unchanged route rebuilt by a re-render", async () => {
    const camera = fakeCamera();

    const { rerender } = await renderHook(
      ({ route }: { route: typeof ROUTE }) =>
        useFitRoute(camera.ref, route, false, false),
      { initialProps: { route: ROUTE } },
    );
    expect(camera.fitBounds).toHaveBeenCalledTimes(1);

    // An equal but freshly built array, as a re-render produces. Identity
    // alone would re-frame and snatch the camera back on every render.
    await rerender({ route: [...ROUTE] });

    expect(camera.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("frames a route once, so a user who pans away keeps their view", async () => {
    const camera = fakeCamera();

    const { rerender } = await renderHook(
      ({ reduced }: { reduced: boolean }) =>
        useFitRoute(camera.ref, ROUTE, false, reduced),
      { initialProps: { reduced: false } },
    );
    expect(camera.fitBounds).toHaveBeenCalledTimes(1);

    // Same route, but something else the fit reads has changed, so the effect
    // runs again. The user may have panned since; the camera stays put.
    await rerender({ reduced: true });

    expect(camera.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("frames a different route when one replaces it", async () => {
    const camera = fakeCamera();

    const { rerender } = await renderHook(
      ({ route }: { route: typeof ROUTE }) =>
        useFitRoute(camera.ref, route, false, false),
      { initialProps: { route: ROUTE } },
    );
    expect(camera.fitBounds).toHaveBeenCalledTimes(1);

    await rerender({ route: OTHER_ROUTE });

    expect(camera.fitBounds).toHaveBeenCalledTimes(2);
    expect(camera.fitBounds).toHaveBeenLastCalledWith(
      [-76.4922, 39.2904],
      [-76.6122, 38.9784],
      ROUTE_FIT_PADDING,
      expect.any(Number),
    );
  });

  it("frames the route after a trip ends and the map returns to an overview", async () => {
    const camera = fakeCamera();

    const { rerender } = await renderHook(
      ({ follow }: { follow: boolean }) =>
        useFitRoute(camera.ref, ROUTE, follow, false),
      { initialProps: { follow: true } },
    );
    expect(camera.fitBounds).not.toHaveBeenCalled();

    await rerender({ follow: false });

    expect(camera.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("centres a route that encloses no area instead of fitting it", async () => {
    const camera = fakeCamera();

    // fitBounds on a zero-area box has no scale to solve for and snaps to the
    // maximum zoom.
    await renderHook(() =>
      useFitRoute(camera.ref, [BALTIMORE, BALTIMORE], false, false),
    );

    expect(camera.fitBounds).not.toHaveBeenCalled();
    expect(camera.setCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        centerCoordinate: [BALTIMORE.lng, BALTIMORE.lat],
        zoomLevel: LOCATED_ZOOM,
      }),
    );
  });

  it("moves without animating when reduced motion is asked for", async () => {
    const camera = fakeCamera();

    await renderHook(() => useFitRoute(camera.ref, ROUTE, false, true));

    expect(camera.fitBounds).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ROUTE_FIT_PADDING,
      0,
    );
  });

  it("reports a settled fit once, so the zoom buttons step from the screen", async () => {
    const camera = fakeCamera();

    const { result } = await renderHook(() =>
      useFitRoute(camera.ref, ROUTE, false, false),
    );

    expect(result.current.fitJustSettled()).toBe(true);
    // Only the fit's own settle counts; later camera moves are not ours.
    expect(result.current.fitJustSettled()).toBe(false);
  });

  it("reports no settled fit when it never moved the camera", async () => {
    const camera = fakeCamera();

    const { result } = await renderHook(() =>
      useFitRoute(camera.ref, ROUTE, true, false),
    );

    expect(result.current.fitJustSettled()).toBe(false);
  });
});
