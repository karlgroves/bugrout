/* eslint-disable max-lines-per-function -- pre-existing; tracked in docs/tech-debt.md (single declarative JSX map tree; splitting the render would obscure the layer ordering) */
/**
 * BugRout Map Component
 *
 * Wraps MapLibre GL React Native with offline PMTiles support.
 * Renders the primary map view with current location, threat overlays,
 * resource markers, and route polylines.
 */

import { useRef, useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { colors } from "@/constants/theme";
import * as MapLibreGL from "@/platform/maplibre";
import { cameraStart, LOCATED_ZOOM } from "@/services/map/cameraStart";
import { buildMapStyle } from "@/services/map/StyleBuilder";
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

  const handleRegionDidChange = useCallback(() => {
    // Visible bounds are read by MapLibre via the ref when needed
  }, []);

  // The style must go through `mapStyle`: maplibre-react-native 10 has no
  // `styleURL` prop, and passing one left MapLibre on its default demo style
  // (#183). MapLibre Native reads the downloaded file via pmtiles:// itself.
  const style = buildMapStyle({
    pmtilesPath: activeRegion?.pmtilesPath ?? null,
  });

  // `defaultSettings` apply once, on first render — usually before the first
  // GPS fix. Move to the user when a fix first arrives, unless the camera is
  // already following them.
  const centredOnUser = useRef(false);
  useEffect(() => {
    if (!userLocation || followUser || centredOnUser.current) return;
    centredOnUser.current = true;
    cameraRef.current?.setCamera({
      centerCoordinate: [userLocation.lng, userLocation.lat],
      zoomLevel: LOCATED_ZOOM,
      animationDuration: 600,
    });
  }, [userLocation, followUser]);

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
          followUserLocation={followUser}
          {...(followUser
            ? { followUserMode: MapLibreGL.UserTrackingMode.FollowWithHeading }
            : {})}
        />

        {/* User location indicator */}
        <MapLibreGL.UserLocation
          visible={!!userLocation}
          renderMode="native"
          androidRenderMode="compass"
        />

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
