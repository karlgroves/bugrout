/**
 * Hook for GPS location tracking.
 * Provides current position, heading, and speed.
 */

import { useState, useEffect, useCallback, useRef } from "react";

import {
  startTracking,
  stopTracking,
  getCurrentPosition,
  type LocationUpdate,
} from "@/services/location/LocationTracker";

/** Reactive GPS state returned by {@link useLocation}. */
export interface UseLocationResult {
  location: LocationUpdate | null;
  position: LocationUpdate["position"] | null;
  heading: number;
  speed: number;
  accuracy: number;
  error: string | null;
  getPosition: () => Promise<LocationUpdate | null>;
}

/**
 * Subscribe to GPS updates while `active` is true and expose current
 * position, heading, speed, accuracy, and a one-shot getPosition helper.
 */
export function useLocation(active = false): UseLocationResult {
  const [location, setLocation] = useState<LocationUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callbackRef = useRef<((update: LocationUpdate) => void) | null>(null);

  // Update the callback ref without triggering re-subscriptions
  callbackRef.current = setLocation;

  useEffect(() => {
    if (!active) return;

    const handleUpdate = (update: LocationUpdate) => {
      callbackRef.current?.(update);
    };

    startTracking(handleUpdate).catch((err) => {
      setError(err instanceof Error ? err.message : "Location error");
    });

    return () => {
      void stopTracking();
    };
  }, [active]);

  const getPosition = useCallback(async (): Promise<LocationUpdate | null> => {
    try {
      const pos = await getCurrentPosition();
      setLocation(pos);
      return pos;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Location error");
      return null;
    }
  }, []);

  return {
    location,
    position: location?.position ?? null,
    heading: location?.heading ?? 0,
    speed: location?.speed ?? 0,
    accuracy: location?.accuracy ?? 999,
    error,
    getPosition,
  };
}
