/**
 * FileSystem platform abstraction.
 *
 * On a native build this is `expo-file-system/legacy`, and its errors propagate.
 * Only where the module is genuinely unavailable — web, or Expo Go without the
 * native module — does it fall back to no-op mocks.
 *
 * `documentDirectory` used to be the mock path on every platform, so on device
 * every directory was created under `/mock-documents/` (which fails, silently)
 * and offline map downloads could never start.
 */

import { Platform } from "react-native";

const FILE_SYSTEM_MODULE = "expo-file-system/legacy";

/** Path used where there is no real file system (web, Expo Go). */
const MOCK_DOCUMENT_DIRECTORY = "/mock-documents/";

/** The subset of `expo-file-system/legacy` this wrapper uses. */
interface ExpoFileSystem {
  documentDirectory: string | null;
  getInfoAsync(path: string): Promise<{ exists: boolean; size?: number }>;
  makeDirectoryAsync(
    path: string,
    options?: { intermediates?: boolean },
  ): Promise<void>;
  deleteAsync(path: string, options?: { idempotent?: boolean }): Promise<void>;
  getFreeDiskStorageAsync(): Promise<number>;
  createDownloadResumable(
    url: string,
    destPath: string,
    options?: Record<string, unknown>,
    onProgress?: (progress: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void,
  ): DownloadResumable;
}

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
 * Load the native file-system module.
 *
 * @returns The module, or `null` on web or when it is not in this binary.
 */
function loadFileSystem(): ExpoFileSystem | null {
  if (Platform.OS === "web") return null;
  try {
    const mod = FILE_SYSTEM_MODULE;
    return require(mod) as ExpoFileSystem;
  } catch {
    return null;
  }
}

const nativeFileSystem = loadFileSystem();

export /**
 * The app's documents directory, with a trailing slash. The real sandbox path
 * on a native build; a mock path where there is no file system.
 */
const documentDirectory: string =
  nativeFileSystem?.documentDirectory ?? MOCK_DOCUMENT_DIRECTORY;

/**
 * Returns information about a file or directory; reports "does not exist"
 * where there is no file system.
 */
export async function getInfoAsync(
  path: string,
): Promise<{ exists: boolean; size?: number }> {
  if (!nativeFileSystem) return { exists: false };
  return nativeFileSystem.getInfoAsync(path);
}

/**
 * Creates a directory; a no-op where there is no file system.
 */
export async function makeDirectoryAsync(
  path: string,
  options?: { intermediates?: boolean },
): Promise<void> {
  if (!nativeFileSystem) return;
  await nativeFileSystem.makeDirectoryAsync(path, options);
}

/**
 * Deletes a file or directory; a no-op where there is no file system.
 */
export async function deleteAsync(
  path: string,
  options?: { idempotent?: boolean },
): Promise<void> {
  if (!nativeFileSystem) return;
  await nativeFileSystem.deleteAsync(path, options);
}

/**
 * Returns the free disk space in bytes; a mock 10 GB where there is no file
 * system.
 */
export async function getFreeDiskStorageAsync(): Promise<number> {
  if (!nativeFileSystem) return 10 * 1024 * 1024 * 1024; // Mock: 10 GB
  return nativeFileSystem.getFreeDiskStorageAsync();
}

/**
 * Creates a resumable download; a mock that "completes" instantly where there
 * is no file system.
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
  if (!nativeFileSystem) {
    return {
      downloadAsync(): Promise<DownloadResult> {
        return Promise.resolve({ uri: destPath, status: 200 });
      },
    };
  }
  return nativeFileSystem.createDownloadResumable(
    url,
    destPath,
    options,
    onProgress,
  );
}
