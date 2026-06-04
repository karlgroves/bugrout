/**
 * Network platform abstraction.
 * Falls back to assuming online in Expo Go.
 */

import { Platform } from "react-native";

export interface NetworkState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

export interface NetworkSubscription {
  remove(): void;
}

export async function getNetworkStateAsync(): Promise<NetworkState> {
  if (Platform.OS === "web") {
    return { isConnected: true, isInternetReachable: true };
  }
  try {
    const mod = "expo-network";
    const Network = require(mod);
    return Network.getNetworkStateAsync();
  } catch {
    return { isConnected: true, isInternetReachable: true };
  }
}

export function addNetworkStateListener(
  callback: (state: NetworkState) => void,
): NetworkSubscription {
  if (Platform.OS === "web") {
    return { remove() {} };
  }
  try {
    const mod = "expo-network";
    const Network = require(mod);
    return Network.addNetworkStateListener(callback);
  } catch {
    // No-op in Expo Go
    return { remove() {} };
  }
}
