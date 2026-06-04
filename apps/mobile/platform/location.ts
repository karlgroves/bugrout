/**
 * Location platform abstraction.
 * Uses expo-location when available, falls back to mock for Expo Go.
 */

import { Platform } from "react-native";

const EXPO_LOCATION = "expo-location";

/**
 *
 */
export interface LocationCoords {
  latitude: number;
  longitude: number;
  speed: number | null;
  accuracy: number | null;
}

/**
 *
 */
export interface LocationResult {
  coords: LocationCoords;
  timestamp: number;
}

/**
 *
 */
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

let usingMock = false;

/**
 * Reports whether the mock location provider is currently in use (web /
 * Expo Go) rather than real device GPS.
 */
export function isUsingMockLocation(): boolean {
  return usingMock;
}

/**
 * Requests foreground location permission, granting a mock permission when
 * expo-location is unavailable.
 */
export async function requestForegroundPermissionsAsync(): Promise<{
  status: string;
}> {
  if (Platform.OS === "web") {
    usingMock = true;
    return { status: "granted" };
  }
  try {
    const mod = EXPO_LOCATION;
    const Location = require(mod);
    return await Location.requestForegroundPermissionsAsync();
  } catch {
    usingMock = true;
    return { status: "granted" };
  }
}

/**
 * Requests background location permission, granting a mock permission when
 * expo-location is unavailable.
 */
export async function requestBackgroundPermissionsAsync(): Promise<{
  status: string;
}> {
  if (Platform.OS === "web") {
    return { status: "granted" };
  }
  try {
    const mod = EXPO_LOCATION;
    const Location = require(mod);
    return await Location.requestBackgroundPermissionsAsync();
  } catch {
    return { status: "granted" };
  }
}

/**
 * Subscribes to position updates, emitting a slowly drifting mock track when
 * expo-location is unavailable.
 */
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
    const mod = EXPO_LOCATION;
    const Location = require(mod);
    return await Location.watchPositionAsync(options, callback);
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

/**
 * Subscribes to compass heading updates, emitting a static mock heading when
 * expo-location is unavailable.
 */
export async function watchHeadingAsync(
  callback: (heading: { trueHeading: number; magHeading: number }) => void,
): Promise<LocationSubscription> {
  if (Platform.OS === "web") {
    callback({ trueHeading: 0, magHeading: 0 });
    return {
      remove() {
        /* no-op mock */
      },
    };
  }
  try {
    const mod = EXPO_LOCATION;
    const Location = require(mod);
    return await Location.watchHeadingAsync(callback);
  } catch {
    // Mock: static heading
    callback({ trueHeading: 0, magHeading: 0 });
    return {
      remove() {
        /* no-op mock */
      },
    };
  }
}

/**
 * Returns the current position once, falling back to a fixed mock position
 * when expo-location is unavailable.
 */
export async function getCurrentPositionAsync(
  options?: Record<string, unknown>,
): Promise<LocationResult> {
  if (Platform.OS === "web") {
    return MOCK_POSITION;
  }
  try {
    const mod = EXPO_LOCATION;
    const Location = require(mod);
    return await Location.getCurrentPositionAsync(options);
  } catch {
    return MOCK_POSITION;
  }
}

/**
 * Reports whether device location services are enabled, assuming enabled when
 * expo-location is unavailable.
 */
export async function hasServicesEnabledAsync(): Promise<boolean> {
  if (Platform.OS === "web") {
    return true;
  }
  try {
    const mod = EXPO_LOCATION;
    const Location = require(mod);
    return await Location.hasServicesEnabledAsync();
  } catch {
    return true;
  }
}

// Re-export accuracy constants
export /**
 *
 */
const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};
