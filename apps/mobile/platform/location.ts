/**
 * Location platform abstraction.
 * Uses expo-location when available, falls back to mock for Expo Go.
 */

import { Platform } from "react-native";

export interface LocationCoords {
  latitude: number;
  longitude: number;
  speed: number | null;
  accuracy: number | null;
}

export interface LocationResult {
  coords: LocationCoords;
  timestamp: number;
}

export interface LocationSubscription {
  remove(): void;
}

// Default mock position — San Francisco
const MOCK_POSITION: LocationResult = {
  coords: {
    latitude: 37.7749,
    longitude: -122.4194,
    speed: 0,
    accuracy: 10,
  },
  timestamp: Date.now(),
};

let _usingMock = false;

export function isUsingMockLocation(): boolean {
  return _usingMock;
}

export async function requestForegroundPermissionsAsync(): Promise<{
  status: string;
}> {
  if (Platform.OS === "web") {
    _usingMock = true;
    return { status: "granted" };
  }
  try {
    const mod = "expo-location";
    const Location = require(mod);
    return Location.requestForegroundPermissionsAsync();
  } catch {
    _usingMock = true;
    return { status: "granted" };
  }
}

export async function requestBackgroundPermissionsAsync(): Promise<{
  status: string;
}> {
  if (Platform.OS === "web") {
    return { status: "granted" };
  }
  try {
    const mod = "expo-location";
    const Location = require(mod);
    return Location.requestBackgroundPermissionsAsync();
  } catch {
    return { status: "granted" };
  }
}

export async function watchPositionAsync(
  options: Record<string, unknown>,
  callback: (location: LocationResult) => void,
): Promise<LocationSubscription> {
  if (Platform.OS === "web") {
    // Mock: emit a position every second with slight drift
    let lat = MOCK_POSITION.coords.latitude;
    const interval = setInterval(() => {
      lat += 0.0001; // Drift north slowly
      callback({
        coords: {
          latitude: lat,
          longitude: MOCK_POSITION.coords.longitude,
          speed: 13.4, // ~30 mph
          accuracy: 10,
        },
        timestamp: Date.now(),
      });
    }, 1000);
    return {
      remove() {
        clearInterval(interval);
      },
    };
  }
  try {
    const mod = "expo-location";
    const Location = require(mod);
    return Location.watchPositionAsync(options, callback);
  } catch {
    // Mock: emit a position every second with slight drift
    let lat = MOCK_POSITION.coords.latitude;
    const interval = setInterval(() => {
      lat += 0.0001; // Drift north slowly
      callback({
        coords: {
          latitude: lat,
          longitude: MOCK_POSITION.coords.longitude,
          speed: 13.4, // ~30 mph
          accuracy: 10,
        },
        timestamp: Date.now(),
      });
    }, 1000);

    return {
      remove() {
        clearInterval(interval);
      },
    };
  }
}

export async function watchHeadingAsync(
  callback: (heading: { trueHeading: number; magHeading: number }) => void,
): Promise<LocationSubscription> {
  if (Platform.OS === "web") {
    callback({ trueHeading: 0, magHeading: 0 });
    return { remove() {} };
  }
  try {
    const mod = "expo-location";
    const Location = require(mod);
    return Location.watchHeadingAsync(callback);
  } catch {
    // Mock: static heading
    callback({ trueHeading: 0, magHeading: 0 });
    return { remove() {} };
  }
}

export async function getCurrentPositionAsync(
  options?: Record<string, unknown>,
): Promise<LocationResult> {
  if (Platform.OS === "web") {
    return MOCK_POSITION;
  }
  try {
    const mod = "expo-location";
    const Location = require(mod);
    return Location.getCurrentPositionAsync(options);
  } catch {
    return MOCK_POSITION;
  }
}

export async function hasServicesEnabledAsync(): Promise<boolean> {
  if (Platform.OS === "web") {
    return true;
  }
  try {
    const mod = "expo-location";
    const Location = require(mod);
    return Location.hasServicesEnabledAsync();
  } catch {
    return true;
  }
}

// Re-export accuracy constants
export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};
