/**
 * The demo location on the map (#205).
 *
 * MapLibre's own puck and follow mode read the device's GPS, which during a
 * demo is somewhere far from Maryland. With the demo location on, the map
 * draws the simulated position itself and keeps the camera on it.
 */

import { useEffect, useRef } from "react";

import { colors } from "@/constants/theme";
import * as MapLibreGL from "@/platform/maplibre";
import { LOCATED_ZOOM } from "@/services/map/cameraStart";
import { useSettingsStore } from "@/stores/useSettingsStore";

import type { LatLng } from "@bugrout/shared";

/** The simulated position: amber, so it doesn't read as the GPS puck. */
function DemoLocationDot({
  position,
}: {
  position: LatLng;
}): React.JSX.Element {
  return (
    <MapLibreGL.ShapeSource
      id="demo-location"
      shape={{
        type: "Feature",
        geometry: { type: "Point", coordinates: [position.lng, position.lat] },
        properties: {},
      }}
    >
      <MapLibreGL.CircleLayer
        id="demo-location-dot"
        style={{
          circleRadius: 9,
          circleColor: colors.warning,
          circleStrokeColor: "#ffffff",
          circleStrokeWidth: 3,
        }}
      />
    </MapLibreGL.ShapeSource>
  );
}

/**
 * How the map shows the user's position: MapLibre's native puck and follow
 * mode normally, or the simulated position drawn and followed here while the
 * demo location is on.
 *
 * @param followUser - Whether the map should follow the user.
 * @param onZoom - Told the zoom level the demo's re-centre sets, so a caller
 *   tracking the camera's zoom stays in step.
 * @returns Whether to use MapLibre's native follow and puck, and the demo
 *   dot to render (null when the demo location is off).
 */
export function useDemoLocationView(
  cameraRef: React.RefObject<MapLibreGL.CameraRef | null>,
  position: LatLng | null | undefined,
  followUser: boolean,
  onZoom?: (zoom: number) => void,
): { nativeFollow: boolean; nativePuck: boolean; dot: React.ReactNode } {
  const demo = useSettingsStore((s) => s.demoLocation);
  const followDemo = demo && followUser;

  // The map centres on the first fix only, which for a reviewer is far from
  // Maryland. Switching the demo on moves the map to Baltimore, once.
  const centredOnDemo = useRef(false);
  useEffect(() => {
    if (!demo) {
      centredOnDemo.current = false;
      return;
    }
    if (!position || followDemo || centredOnDemo.current) return;
    centredOnDemo.current = true;
    onZoom?.(LOCATED_ZOOM);
    cameraRef.current?.setCamera({
      centerCoordinate: [position.lng, position.lat],
      zoomLevel: LOCATED_ZOOM,
      animationDuration: 600,
    });
  }, [cameraRef, demo, position, followDemo, onZoom]);

  useEffect(() => {
    if (!position || !followDemo) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [position.lng, position.lat],
      animationDuration: 900,
    });
  }, [cameraRef, position, followDemo]);

  return {
    nativeFollow: followUser && !demo,
    nativePuck: !demo && position != null,
    dot: demo && position ? <DemoLocationDot position={position} /> : null,
  };
}
