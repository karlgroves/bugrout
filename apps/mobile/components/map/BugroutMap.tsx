/**
 * BugRout Map Component
 *
 * Wraps MapLibre GL React Native with offline PMTiles support.
 * Renders the primary map view with current location, threat overlays,
 * resource markers, and route polylines.
 */

import { useRef, useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import * as MapLibreGL from "@/platform/maplibre";
import type { LatLng } from "@bugrout/shared";
import { useMapStore } from "@/stores/useMapStore";
import { buildMapStyle, styleToDataUri } from "@/services/map/StyleBuilder";
import { getTileSourceUrl } from "@/services/map/LocalTileServer";
import { colors } from "@/constants/theme";

// Initialize MapLibre (required once)
MapLibreGL.setAccessToken(null);

interface BugroutMapProps {
  /** Current user position */
  userLocation?: LatLng | null;
  /** User heading in degrees */
  heading?: number;
  /** Route polyline coordinates to display */
  routeCoordinates?: LatLng[];
  /** Whether to follow user location */
  followUser?: boolean;
  /** Callback when user taps on the map */
  onMapPress?: (coordinate: LatLng) => void;
  /** Callback when map region changes */
  onRegionChange?: (bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  }) => void;
  children?: React.ReactNode;
}

export function BugroutMap({
  userLocation,
  heading = 0,
  routeCoordinates,
  followUser = false,
  onMapPress,
  onRegionChange,
  children,
}: BugroutMapProps) {
  const mapRef = useRef(null);
  const cameraRef = useRef(null);
  const { activeRegion } = useMapStore();

  const handlePress = useCallback(
    (event: unknown) => {
      const e = event as MapLibreGL.OnPressEvent;
      if (onMapPress && e.coordinates) {
        onMapPress({
          lat: e.coordinates.latitude,
          lng: e.coordinates.longitude,
        });
      }
    },
    [onMapPress],
  );

  const handleRegionDidChange = useCallback(() => {
    // Visible bounds are read by MapLibre via the ref when needed
  }, [onRegionChange]);

  // Detect best tile source and build style URL
  const [tileServerPort, setTileServerPort] = useState<number | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!activeRegion?.pmtilesPath) return;

    getTileSourceUrl(activeRegion.pmtilesPath).then((result) => {
      if (result?.port) {
        setTileServerPort(result.port);
      }
    });
  }, [activeRegion?.pmtilesPath]);

  const style = buildMapStyle({
    pmtilesPath: activeRegion?.pmtilesPath ?? null,
    tileServerPort,
  });
  const styleUrl = styleToDataUri(style);

  return (
    <View style={styles.container}>
      <MapLibreGL.MapView
        ref={mapRef}
        style={styles.map}
        styleURL={styleUrl}
        onPress={handlePress}
        onRegionDidChange={handleRegionDidChange}
        attributionEnabled={false}
        logoEnabled={false}
        compassEnabled={true}
        compassViewMargins={{ x: 16, y: 100 }}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: userLocation
              ? [userLocation.lng, userLocation.lat]
              : [-119.4179, 36.7783], // California center as default
            zoomLevel: 10,
          }}
          followUserLocation={followUser}
          followUserMode={
            followUser ? MapLibreGL.UserTrackingMode.FollowWithHeading : undefined
          }
        />

        {/* User location indicator */}
        <MapLibreGL.UserLocation
          visible={!!userLocation}
          renderMode="native"
          androidRenderMode="compass"
        />

        {/* Route polyline */}
        {routeCoordinates && routeCoordinates.length > 0 && (
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
        )}

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
