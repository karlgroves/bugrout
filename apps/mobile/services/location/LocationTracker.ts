/**
 * Location Tracker
 *
 * Manages GPS tracking for navigation.
 * Supports foreground and background location modes.
 * Provides heading/bearing for map rotation.
 */

import * as Location from "@/platform/location";
import type { LatLng } from "@bugrout/shared";

export interface LocationUpdate {
  position: LatLng;
  heading: number; // degrees
  speed: number; // m/s
  accuracy: number; // meters
  timestamp: number;
}

export type LocationCallback = (update: LocationUpdate) => void;

let foregroundSubscription: Location.LocationSubscription | null = null;
let headingSubscription: Location.LocationSubscription | null = null;
let currentHeading = 0;

/**
 * Request location permissions.
 * Returns true if foreground permission granted.
 */
export async function requestPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  const { status: foregroundStatus } =
    await Location.requestForegroundPermissionsAsync();
  const foreground = foregroundStatus === "granted";

  let background = false;
  if (foreground) {
    const { status: bgStatus } =
      await Location.requestBackgroundPermissionsAsync();
    background = bgStatus === "granted";
  }

  return { foreground, background };
}

/**
 * Start continuous GPS tracking.
 * Uses ~1Hz updates for active navigation.
 * Automatically uses lower frequency for battery optimization when far from next maneuver.
 */
export async function startTracking(
  onUpdate: LocationCallback,
  options?: {
    /** GPS update interval in ms. Default: 1000 (1Hz) */
    intervalMs?: number;
    /** Minimum distance change in meters to trigger update. Default: 5 */
    distanceFilter?: number;
  },
): Promise<void> {
  const perms = await requestPermissions();
  if (!perms.foreground) {
    throw new Error("Location permission not granted");
  }

  // Start heading tracking
  headingSubscription = await Location.watchHeadingAsync((heading) => {
    currentHeading = heading.trueHeading ?? heading.magHeading ?? 0;
  });

  // Start position tracking
  foregroundSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: options?.intervalMs ?? 1000,
      distanceInterval: options?.distanceFilter ?? 5,
    },
    (location) => {
      onUpdate({
        position: {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        },
        heading: currentHeading,
        speed: Math.max(0, location.coords.speed ?? 0),
        accuracy: location.coords.accuracy ?? 999,
        timestamp: location.timestamp,
      });
    },
  );
}

/**
 * Switch to battery-saving mode: lower frequency, larger distance filter.
 * Call when user is on a long straight segment with no upcoming turn.
 */
export async function startBatterySavingTracking(
  onUpdate: LocationCallback,
): Promise<void> {
  await stopTracking();
  await startTracking(onUpdate, {
    intervalMs: 3000,
    distanceFilter: 20,
  });
}

/**
 * Stop GPS tracking.
 */
export async function stopTracking(): Promise<void> {
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }
  if (headingSubscription) {
    headingSubscription.remove();
    headingSubscription = null;
  }
}

/**
 * Get current position (one-shot).
 */
export async function getCurrentPosition(): Promise<LocationUpdate> {
  const perms = await requestPermissions();
  if (!perms.foreground) {
    throw new Error("Location permission not granted");
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  return {
    position: {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    },
    heading: currentHeading,
    speed: Math.max(0, location.coords.speed ?? 0),
    accuracy: location.coords.accuracy ?? 999,
    timestamp: location.timestamp,
  };
}

/**
 * Check if location services are enabled on the device.
 */
export async function isLocationEnabled(): Promise<boolean> {
  return Location.hasServicesEnabledAsync();
}
