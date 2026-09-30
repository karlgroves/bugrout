/**
 * Tile Download & Storage Manager
 *
 * Handles downloading, storing, and managing offline tile packages.
 * Downloads land in a `.part` file and replace the previous copy only once
 * complete, so a failed update never leaves a region without a map.
 * Tracks download state in SQLite.
 */

/* eslint-disable max-lines-per-function -- pre-existing long downloadRegion orchestration; tracked in docs/tech-debt.md (split download orchestration) */

import {
  upsertDownloadProgress,
  deleteDownloadProgress,
} from "@/db/queries/downloads";
import {
  insertDownloadedRegion,
  getDownloadedRegions as dbGetDownloadedRegions,
  deleteDownloadedRegion as dbDeleteDownloadedRegion,
} from "@/db/queries/regions";
import { deleteResourcesByRegion } from "@/db/queries/resources";
import { track, Events } from "@/platform/analytics";
import * as FileSystem from "@/platform/fileSystem";
import { useMapStore } from "@/stores/useMapStore";
import { timeoutSignal } from "@/utils/abort";
import { fetchWithRetry } from "@/utils/retry";

import { isRegionStale, publishedVersionsFrom } from "./TileVersions";

import type { Region, DownloadedRegion } from "@bugrout/shared";

const TILE_SERVER_BASE =
  process.env.EXPO_PUBLIC_TILE_SERVER_URL ??
  "https://bugrout-tile-server.karlgroves.workers.dev";
const TILES_DIR = `${FileSystem.documentDirectory}tiles/`;

/**
 *
 */
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
    { signal: timeoutSignal(15000) },
    { maxAttempts: 3, baseDelay: 2000 },
  );
  if (!resp.ok) throw new Error(`Failed to fetch manifest: ${resp.status}`);
  const data = (await resp.json()) as { regions: Region[] };
  useMapStore
    .getState()
    .setPublishedVersions(publishedVersionsFrom(data.regions));
  return data.regions;
}

/**
 * Refresh the published tile versions from the manifest, for stale checks.
 * Offline is expected, so a failure leaves the last known versions in place.
 */
export async function refreshPublishedVersions(): Promise<void> {
  try {
    await fetchManifest();
  } catch {
    // Offline or unreachable: stale checks fall back to download age.
  }
}

/** Subset of the expo-constants module shape used to detect the runtime. */
interface ExpoConstantsModule {
  executionEnvironment?: string;
  default?: { executionEnvironment?: string };
}

/**
 * Check if we're running in Expo Go (vs a custom dev build).
 * Tile downloads require a custom dev build with native filesystem access.
 */
export function isExpoGo(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- native module loaded lazily; mocked on web
    const Constants = require("expo-constants") as ExpoConstantsModule;
    // Expo Go reports "storeClient", dev builds report "standalone" or "bare"
    const env =
      Constants.default?.executionEnvironment ?? Constants.executionEnvironment;
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
    void upsertDownloadProgress({
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
  track(Events.TILE_DOWNLOAD_COMPLETED, {
    region_id: region.id,
    size_mb: Math.round(totalSize / 1048576),
  });

  return result;
}

/**
 * Download a file and swap it in only once it is complete.
 *
 * The body is written to `<destPath>.part`; `destPath` — the copy the map may
 * be reading — is replaced only after a 2xx response, so a failed or cancelled
 * update leaves the previous file intact (#179). The swap is a rename: atomic
 * on Android, and on iOS a remove-then-move with nothing in between.
 *
 * There is no resume. An earlier "resume" sent a `Range` header, but
 * `downloadAsync` overwrites rather than appends, which kept only the tail of
 * the file; a restart is the only correct option until real resume data is used.
 *
 * @throws When the download fails or the server answers with anything but a
 *   2xx; the `.part` file is removed and `destPath` is untouched.
 */
async function downloadFileResumable(
  url: string,
  destPath: string,
  onProgress?: (bytesWritten: number) => void,
): Promise<void> {
  const partPath = `${destPath}.part`;
  await FileSystem.deleteAsync(partPath, { idempotent: true });

  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    partPath,
    {},
    (progress) => {
      onProgress?.(progress.totalBytesWritten);
    },
  );

  let result: Awaited<ReturnType<typeof downloadResumable.downloadAsync>>;
  try {
    result = await downloadResumable.downloadAsync();
  } catch (error) {
    await FileSystem.deleteAsync(partPath, { idempotent: true });
    throw error;
  }
  if (!result || result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(partPath, { idempotent: true });
    throw new Error(
      `Download failed for ${url}${result ? `: HTTP ${result.status}` : ""}`,
    );
  }

  await FileSystem.moveAsync({ from: partPath, to: destPath });
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
  return await FileSystem.getFreeDiskStorageAsync();
}

/**
 * Check for stale tiles and return regions that need updates.
 */
export async function getStaleRegions(): Promise<DownloadedRegion[]> {
  const regions = await dbGetDownloadedRegions();
  const { publishedVersions } = useMapStore.getState();
  return regions.filter((r) => isRegionStale(r, publishedVersions));
}
