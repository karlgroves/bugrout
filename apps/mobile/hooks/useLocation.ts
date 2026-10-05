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
import { useSettingsStore } from "@/stores/useSettingsStore";

/** A fix, and whether it came from the demo location rather than GPS. */
interface SourcedFix {
  fix: LocationUpdate;
  demo: boolean;
}

/** The fix, if it came from the source now in use; null otherwise. */
function fixFromSource(
  tagged: SourcedFix | null,
  demo: boolean,
): LocationUpdate | null {
  return tagged !== null && tagged.demo === demo ? tagged.fix : null;
}

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
  // Each fix is tagged with the source it came from (#205). Switching the demo
  // location on or off restarts tracking from the new source, and until that
  // source's first fix arrives the last one is from the old source — a real
  // position in Cupertino after the demo moved the user to Baltimore. It must
  // be neither shown nor centred on, so a fix from another source reads as
  // no fix at all.
  const [tagged, setTagged] = useState<SourcedFix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const callbackRef = useRef<((fix: SourcedFix) => void) | null>(null);
  const demoLocation = useSettingsStore((s) => s.demoLocation);
  const location = fixFromSource(tagged, demoLocation);

  // Update the callback ref without triggering re-subscriptions
  callbackRef.current = setTagged;

  useEffect(() => {
    if (!active) return;

    const handleUpdate = (update: LocationUpdate) => {
      callbackRef.current?.({ fix: update, demo: demoLocation });
    };

    startTracking(handleUpdate).catch((err) => {
      setError(err instanceof Error ? err.message : "Location error");
    });

    return () => {
      void stopTracking();
    };
  }, [active, demoLocation]);

  const getPosition = useCallback(async (): Promise<LocationUpdate | null> => {
    try {
      const demo = useSettingsStore.getState().demoLocation;
      const pos = await getCurrentPosition();
      setTagged({ fix: pos, demo });
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
