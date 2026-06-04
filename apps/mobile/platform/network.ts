/**
 * Network platform abstraction.
 * Falls back to assuming online in Expo Go.
 */

import { Platform } from "react-native";

/**
 *
 */
export interface NetworkState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

/**
 *
 */
export interface NetworkSubscription {
  remove(): void;
}

/**
 * Returns the current network connectivity state, assuming online when
 * expo-network is unavailable (web / Expo Go).
 */
export async function getNetworkStateAsync(): Promise<NetworkState> {
  if (Platform.OS === "web") {
    return { isConnected: true, isInternetReachable: true };
  }
  try {
    const mod = "expo-network";
    const Network = require(mod);
    return await Network.getNetworkStateAsync();
  } catch {
    return { isConnected: true, isInternetReachable: true };
  }
}

/**
 * Subscribes to network connectivity changes; returns a no-op subscription
 * when expo-network is unavailable.
 */
export function addNetworkStateListener(
  callback: (state: NetworkState) => void,
): NetworkSubscription {
  if (Platform.OS === "web") {
    return { remove() { /* no-op mock */ } };
  }
  try {
    const mod = "expo-network";
    const Network = require(mod);
    return Network.addNetworkStateListener(callback);
  } catch {
    // No-op in Expo Go
    return { remove() { /* no-op mock */ } };
  }
}
