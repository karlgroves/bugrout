/**
 * Switching the demo location on (#205) moves the map to Baltimore once, and
 * tells the map's zoom controls (#188) the zoom it set, so the next button
 * press steps from there rather than from a stale level.
 */
import { act, renderHook } from "@testing-library/react-native";

import { useDemoLocationView } from "@/components/map/DemoLocationLayer";
import { LOCATED_ZOOM } from "@/services/map/cameraStart";
import { useSettingsStore } from "@/stores/useSettingsStore";

import type { CameraRef } from "@/platform/maplibre";

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };

describe("useDemoLocationView", () => {
  afterEach(() => {
    useSettingsStore.setState({ demoLocation: false });
  });

  it("re-centres once when the demo comes on, and reports the zoom it set", async () => {
    const setCamera = jest.fn();
    const cameraRef = { current: { setCamera } as unknown as CameraRef };
    const onZoom = jest.fn();
    await renderHook(() =>
      useDemoLocationView(cameraRef, BALTIMORE, false, onZoom),
    );
    expect(setCamera).not.toHaveBeenCalled();

    await act(async () => {
      useSettingsStore.setState({ demoLocation: true });
      await Promise.resolve();
    });

    expect(setCamera).toHaveBeenCalledTimes(1);
    expect(setCamera).toHaveBeenCalledWith(
      expect.objectContaining({ zoomLevel: LOCATED_ZOOM }),
    );
    expect(onZoom).toHaveBeenCalledWith(LOCATED_ZOOM);
  });
});
