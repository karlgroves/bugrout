/**
 * Hook to track online/offline connectivity status.
 * Updates the connectivity store and provides reactive access.
 */

import { useEffect } from "react";

import * as Network from "@/platform/network";
import { useConnectivityStore } from "@/stores/useConnectivityStore";

/**
 * Track online/offline connectivity, keeping the connectivity store in sync,
 * and return the current online boolean.
 */
export function useOfflineStatus(): boolean {
  const { isOnline, setOnline } = useConnectivityStore();

  useEffect(() => {
    // Check initial state
    Network.getNetworkStateAsync()
      .then((state) => {
        setOnline(
          state.isConnected === true && state.isInternetReachable === true,
        );
      })
      .catch(() => {
        // Network probe failed — assume offline (safe default for an evac app).
        setOnline(false);
      });

    // Subscribe to changes
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(state.isConnected === true && state.isInternetReachable === true);
    });

    return () => {
      subscription.remove();
    };
  }, [setOnline]);

  return isOnline;
}
