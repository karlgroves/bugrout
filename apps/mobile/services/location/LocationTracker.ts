/**
 * Location Tracker
 *
 * Manages GPS tracking for navigation.
 * Supports foreground and background location modes.
 * Provides heading/bearing for map rotation.
 */

import * as Location from "@/platform/location";
import {
  DEMO_ORIGIN,
  demoFix,
  startDemoDrive,
} from "@/services/location/DemoLocation";
import { useRouteStore } from "@/stores/useRouteStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

import type { LatLng } from "@bugrout/shared";

/**
 *
 */
export interface LocationUpdate {
  position: LatLng;
  heading: number; // degrees
  speed: number; // m/s
  accuracy: number; // meters
  timestamp: number;
}

/**
 *
 */
export type LocationCallback = (update: LocationUpdate) => void;

let foregroundSubscription: Location.LocationSubscription | null = null;
let headingSubscription: Location.LocationSubscription | null = null;
let currentHeading = 0;
let stopDemo: (() => void) | null = null;

/** Whether positions come from the demo location instead of GPS (#205). */
function demoLocationOn(): boolean {
  return useSettingsStore.getState().demoLocation;
}

/** The route the demo drives: only a trip under way, never a preview. */
function demoRoute(): readonly LatLng[] | null {
  const { status, activeRoute } = useRouteStore.getState();
  const driving =
    status === "active" || status === "rerouting" || status === "completed";
  return driving ? (activeRoute?.coordinates ?? null) : null;
}

/**
 * Request location permissions.
 * Returns true if foreground permission granted.
 */
async function requestPermissions(): Promise<{
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
  if (demoLocationOn()) {
    stopDemo?.();
    stopDemo = startDemoDrive(onUpdate, demoRoute);
    return;
  }

  const perms = await requestPermissions();
  if (!perms.foreground) {
    throw new Error("Location permission not granted");
  }

  // Start heading tracking
  headingSubscription = await Location.watchHeadingAsync((heading) => {
    // trueHeading is -1 when true north is unavailable; fall back to magnetic.
    currentHeading =
      heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
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
export function stopTracking(): Promise<void> {
  if (stopDemo) {
    stopDemo();
    stopDemo = null;
  }
  if (foregroundSubscription) {
    foregroundSubscription.remove();
    foregroundSubscription = null;
  }
  if (headingSubscription) {
    headingSubscription.remove();
    headingSubscription = null;
  }
  return Promise.resolve();
}

/**
 * Get current position (one-shot).
 */
export async function getCurrentPosition(): Promise<LocationUpdate> {
  if (demoLocationOn()) return demoFix(DEMO_ORIGIN);

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
