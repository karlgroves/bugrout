/**
 * Keeps useConnectivityStore in sync with the device's network state.
 *
 * Nothing wrote to that store before #134 — this hook existed and no screen
 * mounted it — so the always-visible online/offline badge read "Live" forever
 * and useDataSync's came-online refresh never fired. app/_layout.tsx mounts it
 * now, and __tests__/hooks/connectivityWiring.test.ts pins that it stays
 * mounted.
 */

import { useEffect } from "react";

import * as Network from "@/platform/network";
import { useConnectivityStore } from "@/stores/useConnectivityStore";

/**
 * Subscribe to connectivity changes for as long as the caller is mounted.
 *
 * Returns nothing, and subscribes to nothing, on purpose. Its one caller is the
 * root layout, and reading `isOnline` there would re-render the whole
 * navigation stack on every connectivity flip for a value the root does not
 * use. Screens read it straight from the store instead — see StatusIndicator.
 * `setOnline` comes through a selector because the action's identity never
 * changes, so selecting it can never trigger a render.
 */
export function useConnectivityTracking(): void {
  const setOnline = useConnectivityStore((s) => s.setOnline);

  useEffect(() => {
    const online = (state: Network.NetworkState): boolean =>
      state.isConnected === true && state.isInternetReachable === true;

    Network.getNetworkStateAsync()
      .then((state) => {
        setOnline(online(state));
      })
      .catch(() => {
        // Unreachable as platform/network.ts stands: both of its entry points
        // swallow their own errors and report online, which is its documented
        // Expo Go fallback. Kept as the guard for a wrapper that one day does
        // reject, and deliberately the opposite default — for an evacuation
        // app an unknown network is not a live one. Whichever way that
        // disagreement is settled, it belongs in the wrapper, which is the
        // layer that can tell "no expo-network" from "no connection".
        setOnline(false);
      });

    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(online(state));
    });

    return () => {
      subscription.remove();
    };
  }, [setOnline]);
}
