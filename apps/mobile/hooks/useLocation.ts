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

export function useLocation(active: boolean = false) {
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
      stopTracking();
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
