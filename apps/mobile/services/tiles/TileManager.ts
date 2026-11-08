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
import { sha256Hex } from "@/platform/crypto";
import * as FileSystem from "@/platform/fileSystem";
import { captureError } from "@/services/CrashReporting";
import { loadPackagedFuelStations } from "@/services/resources/FuelService";
import { useMapStore } from "@/stores/useMapStore";
import { timeoutSignal } from "@/utils/abort";
import { fetchWithRetry } from "@/utils/retry";

import { downloadSizeBytes, packagedFuelSize } from "./regionSize";
import {
  INCOMPLETE_VERSION,
  isRegionStale,
  publishedVersionsFrom,
} from "./TileVersions";

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

  const fuelSize = packagedFuelSize(region);
  const totalSize = downloadSizeBytes(region);
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
    region.pmtilesSize,
  );

  downloaded = region.pmtilesSize;

  // Routing tiles, when the package has them. A package that lists them but
  // whose archive fails is recorded without a routing path and as incomplete
  // (#292), so it is offered for update instead of passing as current.
  const routingTiles = await downloadRoutingTiles(
    region,
    valhallaPath,
    (bytes) => {
      downloaded = region.pmtilesSize + bytes;
      reportProgress("downloading");
    },
  );

  // Fuel stations (#200), so the fuel layer works with no network at all. A
  // package built before fuel was packaged has none; the layer is then
  // fetched online, as it is when this file fails its check.
  if (fuelSize > 0) {
    const before = region.pmtilesSize + region.valhallaSize;
    try {
      await downloadPackagedFuel(region, regionDir, (bytes) => {
        downloaded = before + bytes;
        reportProgress("downloading");
      });
    } catch (error) {
      // The map is usable without it, and ResourceSync fetches fuel online;
      // but a package whose fuel won't download, verify or parse is a bad
      // package, and should be seen.
      captureError(error instanceof Error ? error : new Error(String(error)), {
        regionId: region.id,
        stage: "packaged-fuel",
      });
    }
  }

  downloaded = totalSize;
  reportProgress("complete");

  const result: DownloadedRegion = {
    id: region.id,
    name: region.name,
    bbox: region.bbox,
    pmtilesPath,
    valhallaTilesPath: routingTiles === "downloaded" ? valhallaPath : "",
    downloadedAt: Date.now(),
    sizeBytes: totalSize,
    version: routingTiles === "failed" ? INCOMPLETE_VERSION : region.version,
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
 * Download a region's routing tiles, when its package has them (none ships
 * one yet; routing then uses the remote service).
 *
 * @returns `"none"` when the package has no routing archive, `"downloaded"`
 *   when it is in place at `valhallaPath`, or `"failed"` when it would not
 *   download or was not the manifest's size — reported, so a bad package is
 *   seen, and left to the caller to record as incomplete (#292).
 */
async function downloadRoutingTiles(
  region: Region,
  valhallaPath: string,
  onProgress: (bytesWritten: number) => void,
): Promise<"none" | "downloaded" | "failed"> {
  if (region.valhallaSize <= 0) return "none";
  try {
    await downloadFileResumable(
      `${TILE_SERVER_BASE}/v1/tiles/${region.id}/valhalla`,
      valhallaPath,
      onProgress,
      region.valhallaSize,
    );
    return "downloaded";
  } catch (error) {
    captureError(error instanceof Error ? error : new Error(String(error)), {
      regionId: region.id,
      stage: "routing-tiles",
    });
    return "failed";
  }
}

/**
 * Download a region's packaged fuel stations, check them against the
 * manifest, and load them into the cache.
 *
 * @throws When the download fails, the file doesn't match the manifest's
 *   SHA-256 (it is then deleted, never loaded), or it can't be parsed.
 */
async function downloadPackagedFuel(
  region: Region,
  regionDir: string,
  onProgress: (bytesWritten: number) => void,
): Promise<void> {
  const fuelPath = `${regionDir}${region.id}.fuel.json`;
  await downloadFileResumable(
    `${TILE_SERVER_BASE}/v1/tiles/${region.id}/fuel`,
    fuelPath,
    onProgress,
  );
  const text = await FileSystem.readAsStringAsync(fuelPath);
  if ((await sha256Hex(text)) !== region.fuelSha256) {
    await FileSystem.deleteAsync(fuelPath, { idempotent: true });
    throw new Error(`Fuel stations for ${region.id} failed verification`);
  }
  await loadPackagedFuelStations(text, region.id, region.updatedAt);
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
 * When the manifest gives the file's size, the downloaded file must be exactly
 * that size before it replaces anything, so a truncated or substituted file
 * never becomes the live copy (#292).
 *
 * @throws When the download fails, the server answers with anything but a
 *   2xx, or the file is not `expectedBytes` long (or its size can't be read);
 *   the `.part` file is removed and `destPath` is untouched.
 */
async function downloadFileResumable(
  url: string,
  destPath: string,
  onProgress?: (bytesWritten: number) => void,
  expectedBytes?: number,
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

  if (expectedBytes !== undefined && expectedBytes > 0) {
    const info = await FileSystem.getInfoAsync(partPath);
    if (info.size !== expectedBytes) {
      await FileSystem.deleteAsync(partPath, { idempotent: true });
      throw new Error(
        `Download for ${url} is ${String(info.size ?? "of unknown size")} bytes, expected ${String(expectedBytes)}`,
      );
    }
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
