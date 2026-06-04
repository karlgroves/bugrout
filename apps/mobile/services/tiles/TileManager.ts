/**
 * Tile Download & Storage Manager
 *
 * Handles downloading, storing, and managing offline tile packages.
 * Supports resumable downloads via HTTP Range headers.
 * Tracks download state in SQLite.
 */

import * as FileSystem from "@/platform/fileSystem";
import { fetchWithRetry } from "@/utils/retry";
import { track, Events } from "@/platform/analytics";
import type { Region, DownloadedRegion } from "@bugrout/shared";
import {
  insertDownloadedRegion,
  getDownloadedRegions as dbGetDownloadedRegions,
  getDownloadedRegion as dbGetDownloadedRegion,
  deleteDownloadedRegion as dbDeleteDownloadedRegion,
} from "@/db/queries/regions";
import {
  upsertDownloadProgress,
  deleteDownloadProgress,
} from "@/db/queries/downloads";
import { deleteResourcesByRegion } from "@/db/queries/resources";

const TILE_SERVER_BASE =
  process.env.EXPO_PUBLIC_TILE_SERVER_URL ?? "https://tiles.bugrout.app";
const TILES_DIR = `${FileSystem.documentDirectory}tiles/`;
const STALE_THRESHOLD_DAYS = 90;

export interface DownloadProgress {
  regionId: string;
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  status: "pending" | "downloading" | "paused" | "complete" | "error";
}

/**
 * Ensure the tiles directory exists.
 */
async function ensureTilesDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(TILES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(TILES_DIR, { intermediates: true });
  }
}

/**
 * Fetch the region manifest from the tile server.
 */
export async function fetchManifest(): Promise<Region[]> {
  const resp = await fetchWithRetry(
    `${TILE_SERVER_BASE}/v1/tiles/manifest`,
    { signal: AbortSignal.timeout(15000) },
    { maxAttempts: 3, baseDelay: 2000 },
  );
  if (!resp.ok) throw new Error(`Failed to fetch manifest: ${resp.status}`);
  const data = (await resp.json()) as { regions: Region[] };
  return data.regions;
}

/**
 * Check if we're running in Expo Go (vs a custom dev build).
 * Tile downloads require a custom dev build with native filesystem access.
 */
export function isExpoGo(): boolean {
  try {
    const Constants = require("expo-constants");
    // Expo Go reports "storeClient", dev builds report "standalone" or "bare"
    const env = Constants.default?.executionEnvironment ?? Constants.executionEnvironment;
    return env === "storeClient";
  } catch {
    return false;
  }
}

/**
 * Download a region's tile package (PMTiles + Valhalla tiles).
 * Supports resume from partial downloads.
 * Requires a custom dev build — not supported in Expo Go.
 */
export async function downloadRegion(
  region: Region,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<DownloadedRegion> {
  if (isExpoGo()) {
    throw new Error(
      "Tile downloads require a custom dev build. Run 'eas build --profile development' to create one.",
    );
  }

  await ensureTilesDir();

  const regionDir = `${TILES_DIR}${region.id}/`;
  const regionDirInfo = await FileSystem.getInfoAsync(regionDir);
  if (!regionDirInfo.exists) {
    await FileSystem.makeDirectoryAsync(regionDir, { intermediates: true });
  }

  const pmtilesPath = `${regionDir}${region.id}.pmtiles`;
  const valhallaPath = `${regionDir}${region.id}.valhalla.tar.gz`;

  const totalSize = region.pmtilesSize + region.valhallaSize;
  let downloaded = 0;

  const reportProgress = (status: DownloadProgress["status"]) => {
    const progress: DownloadProgress = {
      regionId: region.id,
      bytesDownloaded: downloaded,
      totalBytes: totalSize,
      percent: totalSize > 0 ? (downloaded / totalSize) * 100 : 0,
      status,
    };
    onProgress?.(progress);
    upsertDownloadProgress({
      regionId: region.id,
      bytesDownloaded: downloaded,
      totalBytes: totalSize,
      status,
    });
  };

  reportProgress("downloading");

  // Download PMTiles
  await downloadFileResumable(
    `${TILE_SERVER_BASE}/v1/tiles/${region.id}/pmtiles`,
    pmtilesPath,
    (bytes) => {
      downloaded = bytes;
      reportProgress("downloading");
    },
  );

  downloaded = region.pmtilesSize;

  // Download Valhalla tiles (optional — skip if size is 0 or server 404s,
  // since we route via remote Valhalla on Fly.io)
  if (region.valhallaSize > 0) {
    try {
      await downloadFileResumable(
        `${TILE_SERVER_BASE}/v1/tiles/${region.id}/valhalla`,
        valhallaPath,
        (bytes) => {
          downloaded = region.pmtilesSize + bytes;
          reportProgress("downloading");
        },
      );
    } catch {
      // Valhalla tiles not available — routing will use remote service
    }
  }

  downloaded = totalSize;
  reportProgress("complete");

  const result: DownloadedRegion = {
    id: region.id,
    name: region.name,
    bbox: region.bbox,
    pmtilesPath,
    valhallaTilesPath: valhallaPath,
    downloadedAt: Date.now(),
    sizeBytes: totalSize,
    version: region.version,
  };

  await insertDownloadedRegion(result);
  await deleteDownloadProgress(region.id);
  track(Events.TILE_DOWNLOAD_COMPLETED, { region_id: region.id, size_mb: Math.round(totalSize / 1048576) });

  return result;
}

/**
 * Download a file with resume support.
 */
async function downloadFileResumable(
  url: string,
  destPath: string,
  onProgress?: (bytesWritten: number) => void,
): Promise<void> {
  // Check for existing partial download
  const fileInfo = await FileSystem.getInfoAsync(destPath);
  let existingBytes = 0;
  if (fileInfo.exists && "size" in fileInfo && typeof fileInfo.size === "number") {
    existingBytes = fileInfo.size;
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    destPath,
    {
      headers: existingBytes > 0 ? { Range: `bytes=${existingBytes}-` } : {},
    },
    (progress) => {
      onProgress?.(
        existingBytes + progress.totalBytesWritten,
      );
    },
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) {
    throw new Error(`Download failed for ${url}`);
  }
}

/**
 * Check if a downloaded region's tiles are stale (>90 days old).
 */
export function isRegionStale(region: DownloadedRegion): boolean {
  const ageMs = Date.now() - region.downloadedAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > STALE_THRESHOLD_DAYS;
}

/**
 * Delete a downloaded region's tiles from device storage.
 */
export async function deleteRegion(regionId: string): Promise<void> {
  const regionDir = `${TILES_DIR}${regionId}/`;
  const dirInfo = await FileSystem.getInfoAsync(regionDir);
  if (dirInfo.exists) {
    await FileSystem.deleteAsync(regionDir, { idempotent: true });
  }

  await dbDeleteDownloadedRegion(regionId);
  await deleteResourcesByRegion(regionId);
  await deleteDownloadProgress(regionId);
}

/**
 * Get list of all downloaded regions.
 */
export async function getDownloadedRegions(): Promise<DownloadedRegion[]> {
  return dbGetDownloadedRegions();
}

/**
 * Get a specific downloaded region.
 */
export async function getDownloadedRegion(
  regionId: string,
): Promise<DownloadedRegion | null> {
  return dbGetDownloadedRegion(regionId);
}

/**
 * Get total storage used by all downloaded tiles.
 */
export async function getTotalStorageUsed(): Promise<number> {
  const regions = await dbGetDownloadedRegions();
  return regions.reduce((sum, r) => sum + r.sizeBytes, 0);
}

/**
 * Get available device storage in bytes.
 */
export async function getAvailableStorage(): Promise<number> {
  const freeSpace = await FileSystem.getFreeDiskStorageAsync();
  return freeSpace;
}

/**
 * Check for stale tiles and return regions that need updates.
 */
export async function getStaleRegions(): Promise<DownloadedRegion[]> {
  const regions = await dbGetDownloadedRegions();
  return regions.filter(isRegionStale);
}
