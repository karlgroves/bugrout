/* eslint-disable max-lines-per-function -- pre-existing; tracked in docs/tech-debt.md (single declarative JSX map tree; splitting the render would obscure the layer ordering) */
/**
 * BugRout Map Component
 *
 * Wraps MapLibre GL React Native with offline PMTiles support.
 * Renders the primary map view with current location, threat overlays,
 * resource markers, and route polylines.
 */

import { useRef, useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useDemoLocationView } from "@/components/map/DemoLocationLayer";
import { MapZoomControls } from "@/components/map/MapZoomControls";
import { colors } from "@/constants/theme";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import * as MapLibreGL from "@/platform/maplibre";
import { cameraStart, LOCATED_ZOOM } from "@/services/map/cameraStart";
import { buildMapStyle } from "@/services/map/StyleBuilder";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  NAVIGATION_ZOOM,
  stepZoom,
} from "@/services/map/zoom";
import { useMapStore } from "@/stores/useMapStore";

import type { LatLng } from "@bugrout/shared";

// Initialize MapLibre (required once)
MapLibreGL.setAccessToken(null);

/**
 *
 */
interface BugroutMapProps {
  /** Current user position */
  userLocation?: LatLng | null | undefined;
  /** User heading in degrees */
  heading?: number | undefined;
  /** Route polyline coordinates to display */
  routeCoordinates?: LatLng[] | undefined;
  /** Whether to follow user location */
  followUser?: boolean | undefined;
  /** Callback when user taps on the map */
  onMapPress?: ((coordinate: LatLng) => void) | undefined;
  /** Callback when map region changes */
  onRegionChange?:
    | ((bbox: {
        west: number;
        south: number;
        east: number;
        north: number;
      }) => void)
    | undefined;
  children?: React.ReactNode;
}

/**
 * Primary map view wrapping MapLibre GL with offline PMTiles, rendering the
 * user's location, the active route polyline, and any child overlays.
 */
export function BugroutMap({
  userLocation,
  routeCoordinates,
  followUser = false,
  onMapPress,
  children,
}: BugroutMapProps): React.JSX.Element {
  const mapRef = useRef(null);
  const cameraRef = useRef<MapLibreGL.CameraRef>(null);
  const { activeRegion } = useMapStore();

  const handlePress = useCallback(
    // MapView's onPress delivers a GeoJSON Point at the tapped location — not
    // the `{ coordinates: { latitude, longitude } }` layer-press event this used
    // to read, whose missing `coordinates` meant a tap never reached
    // onMapPress (#183).
    (feature: GeoJSON.Feature) => {
      if (!onMapPress || feature.geometry.type !== "Point") return;
      const [lng, lat] = feature.geometry.coordinates;
      if (lng !== undefined && lat !== undefined) {
        onMapPress({ lat, lng });
      }
    },
    [onMapPress],
  );

  // The map's zoom level, kept in step with pinches so a button press moves
  // one level from wherever the user left it.
  // Navigation starts at street level; otherwise wherever the map opens.
  const [zoom, setZoom] = useState(() =>
    followUser
      ? NAVIGATION_ZOOM
      : cameraStart(userLocation, activeRegion?.bbox).zoomLevel,
  );

  // With the demo location on (#205) the map draws and follows the
  // simulated position itself; MapLibre's own puck would show the real GPS.
  // Its one-off re-centre reports the zoom it sets, so the buttons step from it.
  const demo = useDemoLocationView(
    cameraRef,
    userLocation,
    followUser,
    setZoom,
  );
  const nativeFollow = demo.nativeFollow;
  const reducedMotion = useReducedMotion();

  // Only the user's own gestures move the base a button steps from. Camera
  // moves the app makes (a zoom animation, follow mode) also report here, and
  // taking those would let an animation still in flight overwrite the step a
  // quick second press had just set, losing presses.
  const handleRegionDidChange = useCallback(
    (feature: {
      properties?: { zoomLevel?: number; isUserInteraction?: boolean };
    }) => {
      const level = feature.properties?.zoomLevel;
      if (feature.properties?.isUserInteraction && typeof level === "number") {
        setZoom(level);
      }
    },
    [],
  );

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      const next = stepZoom(zoom, direction);
      setZoom(next);
      // While following the user the camera's followZoomLevel (bound to
      // `zoom` below) applies it, so the map keeps tracking them; a zoomTo
      // here would drop out of follow mode.
      if (!followUser) {
        cameraRef.current?.zoomTo(next, reducedMotion ? 0 : 300);
      }
    },
    [zoom, followUser, reducedMotion],
  );

  // The style must go through `mapStyle`: maplibre-react-native 10 has no
  // `styleURL` prop, and passing one left MapLibre on its default demo style
  // (#183). MapLibre Native reads the downloaded file via pmtiles:// itself.
  const style = buildMapStyle({
    pmtilesPath: activeRegion?.pmtilesPath ?? null,
  });

  // `defaultSettings` apply once, on first render — usually before the first
  // GPS fix. Move to the user when a fix first arrives, unless the camera is
  // already following them.
  // A fix known at first render is already where `defaultSettings` opened.
  const centredOnUser = useRef(userLocation != null);
  useEffect(() => {
    if (!userLocation || nativeFollow || centredOnUser.current) return;
    centredOnUser.current = true;
    setZoom(LOCATED_ZOOM);
    cameraRef.current?.setCamera({
      centerCoordinate: [userLocation.lng, userLocation.lat],
      zoomLevel: LOCATED_ZOOM,
      animationDuration: 600,
    });
  }, [userLocation, nativeFollow]);

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        mapStyle={style}
        onPress={handlePress}
        onRegionDidChange={handleRegionDidChange}
        attributionEnabled={false}
        logoEnabled={false}
        compassEnabled={true}
        compassViewMargins={{ x: 16, y: 100 }}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={cameraStart(userLocation, activeRegion?.bbox)}
          followUserLocation={nativeFollow}
          minZoomLevel={MIN_ZOOM}
          maxZoomLevel={MAX_ZOOM}
          {...(nativeFollow
            ? {
                followUserMode: MapLibreGL.UserTrackingMode.FollowWithHeading,
                followZoomLevel: zoom,
              }
            : {})}
        />

        {/* User location indicator */}
        <MapLibreGL.UserLocation
          visible={demo.nativePuck}
          renderMode="native"
          androidRenderMode="compass"
        />
        {demo.dot}

        {/* Route polyline */}
        {routeCoordinates && routeCoordinates.length > 0 ? (
          <MapLibreGL.ShapeSource
            id="route-line"
            shape={{
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: routeCoordinates.map((c) => [c.lng, c.lat]),
              },
              properties: {},
            }}
          >
            <MapLibreGL.LineLayer
              id="route-line-layer"
              style={{
                lineColor: colors.routeLine,
                lineWidth: 6,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* Route line outline for contrast */}
            <MapLibreGL.LineLayer
              id="route-line-outline"
              belowLayerID="route-line-layer"
              style={{
                lineColor: "#000000",
                lineWidth: 10,
                lineCap: "round",
                lineJoin: "round",
                lineOpacity: 0.3,
              }}
            />
          </MapLibreGL.ShapeSource>
        ) : null}

        {children}
      </MapLibreGL.MapView>

      <MapZoomControls
        onZoomIn={() => {
          zoomBy(1);
        }}
        onZoomOut={() => {
          zoomBy(-1);
        }}
        canZoomIn={zoom < MAX_ZOOM}
        canZoomOut={zoom > MIN_ZOOM}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
