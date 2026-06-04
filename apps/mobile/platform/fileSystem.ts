/**
 * FileSystem platform abstraction.
 * Falls back to no-op mock in Expo Go.
 */

import { Platform } from "react-native";

const FILE_SYSTEM_MODULE = "expo-file-system/legacy";

export /**
 *
 */
const documentDirectory = "/mock-documents/";

/**
 * Result of a resumable download's `downloadAsync` call.
 */
interface DownloadResult {
  uri: string;
  status: number;
}

/**
 * A resumable download handle exposing `downloadAsync` to start/resume it.
 */
export interface DownloadResumable {
  downloadAsync(): Promise<DownloadResult | undefined>;
}

/**
 * Returns information about a file or directory, reporting "does not exist"
 * when the file system module is unavailable.
 */
export async function getInfoAsync(
  path: string,
): Promise<{ exists: boolean; size?: number }> {
  if (Platform.OS === "web") {
    return { exists: false };
  }
  try {
    const mod = FILE_SYSTEM_MODULE;
    const FS = require(mod);
    return await FS.getInfoAsync(path);
  } catch {
    return { exists: false };
  }
}

/**
 * Creates a directory; a no-op when the file system module is unavailable.
 */
export async function makeDirectoryAsync(
  path: string,
  options?: { intermediates?: boolean },
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = FILE_SYSTEM_MODULE;
    const FS = require(mod);
    await FS.makeDirectoryAsync(path, options);
  } catch {
    // No-op in Expo Go
  }
}

/**
 * Deletes a file or directory; a no-op when the file system module is
 * unavailable.
 */
export async function deleteAsync(
  path: string,
  options?: { idempotent?: boolean },
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  try {
    const mod = FILE_SYSTEM_MODULE;
    const FS = require(mod);
    await FS.deleteAsync(path, options);
  } catch {
    // No-op
  }
}

/**
 * Returns the free disk space in bytes, falling back to a mock 10 GB when the
 * file system module is unavailable.
 */
export async function getFreeDiskStorageAsync(): Promise<number> {
  if (Platform.OS === "web") {
    return 10 * 1024 * 1024 * 1024; // Mock: 10 GB
  }
  try {
    const mod = FILE_SYSTEM_MODULE;
    const FS = require(mod);
    return await FS.getFreeDiskStorageAsync();
  } catch {
    return 10 * 1024 * 1024 * 1024; // Mock: 10 GB
  }
}

/**
 * Creates a resumable download, returning a mock that completes instantly
 * when the file system module is unavailable.
 */
export function createDownloadResumable(
  url: string,
  destPath: string,
  options?: Record<string, unknown>,
  onProgress?: (progress: {
    totalBytesWritten: number;
    totalBytesExpectedToWrite: number;
  }) => void,
): DownloadResumable {
  if (Platform.OS === "web") {
    return {
      downloadAsync(): Promise<DownloadResult> {
        return Promise.resolve({ uri: destPath, status: 200 });
      },
    };
  }
  try {
    const mod = FILE_SYSTEM_MODULE;
    const FS = require(mod);
    return FS.createDownloadResumable(url, destPath, options, onProgress);
  } catch {
    // Mock download that "completes" instantly
    return {
      downloadAsync(): Promise<DownloadResult> {
        return Promise.resolve({ uri: destPath, status: 200 });
      },
    };
  }
}
