/**
 * FileSystem platform abstraction.
 * Falls back to no-op mock in Expo Go.
 */

import { Platform } from "react-native";

export const documentDirectory = "/mock-documents/";

export async function getInfoAsync(
  path: string,
): Promise<{ exists: boolean; size?: number }> {
  if (Platform.OS === "web") {
    return { exists: false };
  }
  try {
    const mod = "expo-file-system/legacy";
    const FS = require(mod);
    return FS.getInfoAsync(path);
  } catch {
    return { exists: false };
  }
}

export async function makeDirectoryAsync(
  path: string,
  options?: { intermediates?: boolean },
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = "expo-file-system/legacy";
    const FS = require(mod);
    return FS.makeDirectoryAsync(path, options);
  } catch {
    // No-op in Expo Go
  }
}

export async function deleteAsync(
  path: string,
  options?: { idempotent?: boolean },
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = "expo-file-system/legacy";
    const FS = require(mod);
    return FS.deleteAsync(path, options);
  } catch {
    // No-op
  }
}

export async function getFreeDiskStorageAsync(): Promise<number> {
  if (Platform.OS === "web") {
    return 10 * 1024 * 1024 * 1024; // Mock: 10 GB
  }
  try {
    const mod = "expo-file-system/legacy";
    const FS = require(mod);
    return FS.getFreeDiskStorageAsync();
  } catch {
    return 10 * 1024 * 1024 * 1024; // Mock: 10 GB
  }
}

export function createDownloadResumable(
  url: string,
  destPath: string,
  options?: Record<string, unknown>,
  onProgress?: (progress: {
    totalBytesWritten: number;
    totalBytesExpectedToWrite: number;
  }) => void,
) {
  if (Platform.OS === "web") {
    return {
      async downloadAsync() {
        return { uri: destPath, status: 200 };
      },
    };
  }
  try {
    const mod = "expo-file-system/legacy";
    const FS = require(mod);
    return FS.createDownloadResumable(url, destPath, options, onProgress);
  } catch {
    // Mock download that "completes" instantly
    return {
      async downloadAsync() {
        return { uri: destPath, status: 200 };
      },
    };
  }
}
