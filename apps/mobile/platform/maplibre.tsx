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

export /**
 *
 */
const isMapLibreAvailable = MapLibreGL !== null;

// --- Real or mock setAccessToken ---

/**
 * Sets the MapLibre access token when the native module is available;
 * a no-op on web / Expo Go where the mock implementation is used.
 */
export function setAccessToken(token: string | null): void {
  if (MapLibreGL) {
    MapLibreGL.setAccessToken(token);
  }
}

// --- Mock helpers ---

/** Data-only wrapper (ShapeSource) — passes children through invisibly */
function MockDataSource({ children }: { children?: React.ReactNode; [key: string]: unknown }) {
  return <>{children}</>;
}

/** Invisible component (Camera, UserLocation, Layers) */
function MockHidden(_props: Record<string, unknown>) {
  return null;
}

// --- MapView ---

export /**
 *
 */
const MapView = MapLibreGL?.MapView ?? (({
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
      onPress?.({
        coordinates: { latitude: 37.7749, longitude: -122.4194 },
        features: [],
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
));

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
const UserTrackingMode = MapLibreGL?.UserTrackingMode ?? {
  Follow: "normal",
  FollowWithHeading: "compass",
  FollowWithCourse: "course",
};

// --- OnPressEvent type ---
/**
 *
 */
export interface OnPressEvent {
  features: {
    type: string;
    geometry: { type: string; coordinates: number[] };
    properties: Record<string, unknown>;
  }[];
  // Optional: taps on empty map areas may arrive without coordinates.
  coordinates?: { latitude: number; longitude: number };
}

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
