/**
 * Hook that manages background data synchronization.
 *
 * Triggers threat and resource data refresh when:
 * - App comes online after being offline
 * - Active map region changes
 * - TTL expires for cached data
 *
 * All fetches are non-blocking — cached data is always shown immediately.
 */

import { useEffect, useRef, useCallback } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { refreshResources } from "@/services/resources/ResourceSync";
import { refreshThreats } from "@/services/threats/ThreatSync";
import { useConnectivityStore } from "@/stores/useConnectivityStore";
import { useMapStore } from "@/stores/useMapStore";

/** Minimum interval between sync attempts (5 minutes) */
const SYNC_COOLDOWN_MS = 300000;

/**
 * Imperative handle returned by {@link useDataSync}.
 */
export interface DataSyncHandle {
  /** Triggers a threat and resource refresh, respecting the cooldown. */
  sync: () => Promise<void>;
}

/**
 * Manages background threat/resource sync on connectivity, region, and foreground changes.
 */
export function useDataSync(): DataSyncHandle {
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const activeRegion = useMapStore((s) => s.activeRegion);
  const lastSyncRef = useRef(0);
  const prevOnlineRef = useRef(isOnline);

  const sync = useCallback(async () => {
    if (!activeRegion) return;

    const now = Date.now();
    if (now - lastSyncRef.current < SYNC_COOLDOWN_MS) return;
    lastSyncRef.current = now;

    // Run syncs in parallel — they handle their own errors
    await Promise.allSettled([
      refreshThreats(activeRegion.bbox, activeRegion.id),
      refreshResources(activeRegion.id, activeRegion.bbox),
    ]);
  }, [activeRegion]);

  // Sync when app comes online (was offline, now online)
  useEffect(() => {
    if (isOnline && !prevOnlineRef.current) {
      void sync();
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, sync]);

  // Sync when active region changes
  useEffect(() => {
    if (activeRegion) {
      void sync();
    }
    // Depend on region id only — re-sync on region change, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRegion?.id, sync]);

  // Sync when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (nextState === "active") {
          void sync();
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [sync]);

  return { sync };
}
