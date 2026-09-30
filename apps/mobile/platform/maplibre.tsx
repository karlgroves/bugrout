/**
 * MapLibre platform abstraction.
 *
 * Tries to load @maplibre/maplibre-react-native.
 * Falls back to a mock implementation that renders a visible dark map
 * placeholder, so the app is usable in web preview / Expo Go.
 */

import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";

import type * as MapLibreModule from "@maplibre/maplibre-react-native";

let MapLibreGL: typeof MapLibreModule | null = null;

if (Platform.OS !== "web") {
  try {
    const mod = "@maplibre/maplibre-react-native";
    MapLibreGL = require(mod);
  } catch {
    // Not available — will use mocks below
  }
}

// --- Real or mock setAccessToken ---

/**
 * Sets the MapLibre access token when the native module is available;
 * a no-op on web / Expo Go where the mock implementation is used.
 */
export function setAccessToken(token: string | null): void {
  if (MapLibreGL) {
    // Resolves once the native side has the token; nothing waits on it.
    void MapLibreGL.setAccessToken(token);
  }
}

// --- Mock helpers ---

/** Data-only wrapper (ShapeSource) — passes children through invisibly */
function MockDataSource({
  children,
}: {
  children?: React.ReactNode;
  [key: string]: unknown;
}) {
  return <>{children}</>;
}

/** Invisible component (Camera, UserLocation, Layers) */
function MockHidden(_props: Record<string, unknown>) {
  return null;
}

// --- MapView ---
/** Mock map for web / Expo Go: a dark placeholder with grid lines. */
const MockMapView = ({
  children,
  style,
  onPress,
}: {
  children?: React.ReactNode;
  style?: object;
  onPress?: (event: unknown) => void;
  [key: string]: unknown;
}) => (
  <View
    style={[mockStyles.map, style]}
    onTouchEnd={() => {
      // The shape MapView's onPress delivers: a GeoJSON Point at the tap.
      // This used to send the `{ coordinates }` layer-press event, which
      // BugroutMap no longer reads, so a tap on the placeholder threw.
      onPress?.({
        type: "Feature",
        geometry: { type: "Point", coordinates: [-122.4194, 37.7749] },
        properties: {},
      });
    }}
  >
    {/* Grid lines to suggest a map */}
    <View style={mockStyles.gridH} />
    <View style={[mockStyles.gridH, { top: "33%" }]} />
    <View style={[mockStyles.gridH, { top: "66%" }]} />
    <View style={mockStyles.gridV} />
    <View style={[mockStyles.gridV, { left: "33%" }]} />
    <View style={[mockStyles.gridV, { left: "66%" }]} />

    {/* Crosshair center */}
    <View style={mockStyles.crosshair}>
      <View style={mockStyles.crosshairDot} />
    </View>

    {/* Label */}
    <View style={mockStyles.labelBox}>
      <Text style={mockStyles.label}>Map Preview</Text>
      <Text style={mockStyles.sublabel}>
        Install a dev build for full MapLibre rendering
      </Text>
    </View>

    {/* Children (ShapeSources etc. render invisibly) */}
    {children}
  </View>
);

export /**
 * The MapLibre map view, or a placeholder where the native module is absent.
 *
 * Typed as the real component so an unsupported prop fails typecheck. It used
 * to be the union with the mock, whose `[key: string]: unknown` props accepted
 * anything — which is how `styleURL`, a prop maplibre-react-native 10 does not
 * have, went unnoticed and the app's style was never applied (#183).
 */
const MapView = (MapLibreGL?.MapView ??
  MockMapView) as unknown as typeof MapLibreModule.MapView;

/** Imperative handle of {@link Camera} (setCamera, flyTo, …). */
export type CameraRef = MapLibreModule.CameraRef;

// --- Camera ---
export /**
 *
 */
const Camera = MapLibreGL?.Camera ?? MockHidden;

// --- UserLocation ---
export /**
 *
 */
const UserLocation = MapLibreGL?.UserLocation ?? MockHidden;

// --- ShapeSource (data-only, children pass through) ---
export /**
 *
 */
const ShapeSource = MapLibreGL?.ShapeSource ?? MockDataSource;

// --- Layers (all invisible in mock) ---
export /**
 *
 */
const LineLayer = MapLibreGL?.LineLayer ?? MockHidden;
export /**
 *
 */
const FillLayer = MapLibreGL?.FillLayer ?? MockHidden;
export /**
 *
 */
const CircleLayer = MapLibreGL?.CircleLayer ?? MockHidden;
export /**
 *
 */
const SymbolLayer = MapLibreGL?.SymbolLayer ?? MockHidden;

// --- Constants ---
export /**
 *
 */
const UserTrackingMode = (MapLibreGL?.UserTrackingMode ?? {
  Follow: "normal",
  FollowWithHeading: "compass",
  FollowWithCourse: "course",
}) as typeof MapLibreModule.UserTrackingMode;

// --- OnPressEvent type ---
/** A map or layer press: the pressed coordinate and the features under it. */
export type OnPressEvent = MapLibreModule.OnPressEvent;

// --- Styles ---
const mockStyles = StyleSheet.create({
  map: {
    flex: 1,
    backgroundColor: "#0d1117",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  gridH: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(34, 197, 94, 0.08)",
  },
  gridV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 1,
    backgroundColor: "rgba(34, 197, 94, 0.08)",
  },
  crosshair: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(34, 197, 94, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  crosshairDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22c55e",
  },
  labelBox: {
    position: "absolute",
    bottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 8,
  },
  label: {
    color: "#888",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  sublabel: {
    color: "#555",
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
});
