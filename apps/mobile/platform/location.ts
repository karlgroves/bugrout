/**
 * Location platform abstraction.
 *
 * On a native build this is expo-location, and its errors propagate: a
 * rejected permission request, a watch that cannot start because location
 * services are off, or a fix that times out reaches the caller as an error.
 * Only where the module is genuinely unavailable — web, or Expo Go without
 * the native module — does it fall back to a mock position and a mock grant.
 *
 * The module used to be required inside each call's `try`, so a runtime
 * rejection from a present, working module landed in the same `catch` as
 * "module missing" and returned a fabricated grant and a fabricated San
 * Francisco fix on a real device (#299).
 */

import { Platform } from "react-native";

const EXPO_LOCATION = "expo-location";

/** The subset of expo-location this wrapper uses. */
interface ExpoLocation {
  requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  requestBackgroundPermissionsAsync(): Promise<{ status: string }>;
  watchPositionAsync(
    options: Record<string, unknown>,
    callback: (location: LocationResult) => void,
  ): Promise<LocationSubscription>;
  watchHeadingAsync(
    callback: (heading: { trueHeading: number; magHeading: number }) => void,
  ): Promise<LocationSubscription>;
  getCurrentPositionAsync(
    options?: Record<string, unknown>,
  ): Promise<LocationResult>;
  hasServicesEnabledAsync(): Promise<boolean>;
}

/**
 *
 */
interface LocationCoords {
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

/**
 * Load the native location module.
 *
 * @returns The module, or `null` on web or when it is not in this binary.
 */
function loadLocation(): ExpoLocation | null {
  if (Platform.OS === "web") return null;
  try {
    const mod = EXPO_LOCATION;
    return require(mod) as ExpoLocation;
  } catch {
    return null;
  }
}

const nativeLocation = loadLocation();

/**
 * Whether positions from this wrapper are simulated because expo-location is
 * not available (web, Expo Go). Never true on a build that ships the module.
 */
export function isUsingMockLocation(): boolean {
  return nativeLocation === null;
}

/**
 * Requests foreground location permission. Grants a mock permission only
 * where expo-location is unavailable; a rejection from the real module
 * propagates.
 */
export async function requestForegroundPermissionsAsync(): Promise<{
  status: string;
}> {
  if (!nativeLocation) return { status: "granted" };
  return nativeLocation.requestForegroundPermissionsAsync();
}

/**
 * Requests background location permission. Grants a mock permission only
 * where expo-location is unavailable; a rejection from the real module
 * propagates.
 */
export async function requestBackgroundPermissionsAsync(): Promise<{
  status: string;
}> {
  if (!nativeLocation) return { status: "granted" };
  return nativeLocation.requestBackgroundPermissionsAsync();
}

/**
 * Emits a slowly drifting mock position once per second.
 *
 * Used only where expo-location is unavailable (web, Expo Go), so the
 * navigation UI has a moving fix to render against without real GPS.
 */
function watchMockPosition(
  callback: (location: LocationResult) => void,
): LocationSubscription {
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

/**
 * Subscribes to position updates. Emits a slowly drifting mock track only
 * where expo-location is unavailable; a watch the real module cannot start
 * (location services off, provider unavailable) rejects.
 */
export async function watchPositionAsync(
  options: Record<string, unknown>,
  callback: (location: LocationResult) => void,
): Promise<LocationSubscription> {
  if (!nativeLocation) return watchMockPosition(callback);
  return nativeLocation.watchPositionAsync(options, callback);
}

/**
 * Subscribes to compass heading updates. Emits a static mock heading only
 * where expo-location is unavailable; a rejection from the real module
 * propagates.
 */
export async function watchHeadingAsync(
  callback: (heading: { trueHeading: number; magHeading: number }) => void,
): Promise<LocationSubscription> {
  if (!nativeLocation) {
    callback({ trueHeading: 0, magHeading: 0 });
    return {
      remove() {
        /* no-op mock */
      },
    };
  }
  return nativeLocation.watchHeadingAsync(callback);
}

/**
 * Returns the current position once. Returns a fixed mock position only
 * where expo-location is unavailable; a fix the real module cannot get
 * (unavailable, timed out) rejects.
 */
export async function getCurrentPositionAsync(
  options?: Record<string, unknown>,
): Promise<LocationResult> {
  if (!nativeLocation) return MOCK_POSITION;
  return nativeLocation.getCurrentPositionAsync(options);
}

/**
 * Reports whether device location services are enabled. Assumes enabled only
 * where expo-location is unavailable; when the real module cannot answer it
 * fails closed and reports `false`.
 */
export async function hasServicesEnabledAsync(): Promise<boolean> {
  if (!nativeLocation) return true;
  try {
    return await nativeLocation.hasServicesEnabledAsync();
  } catch {
    return false;
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
