/**
 * SQLite queries for tracking download progress.
 */

import { getDatabase } from "../database";

/**
 * Lifecycle status of a region tile download.
 */
type DownloadStatus =
  "pending" | "downloading" | "paused" | "complete" | "error";

/**
 * Persisted download progress record for a single region.
 */
export interface DownloadProgressRow {
  regionId: string;
  bytesDownloaded: number;
  totalBytes: number;
  status: DownloadStatus;
}

/**
 * Inserts or replaces the download progress record for a region.
 */
export async function upsertDownloadProgress(
  progress: DownloadProgressRow,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO download_progress
     (region_id, bytes_downloaded, total_bytes, status)
     VALUES (?, ?, ?, ?)`,
    progress.regionId,
    progress.bytesDownloaded,
    progress.totalBytes,
    progress.status,
  );
}

/**
 * Removes the download progress record for a region.
 */
export async function deleteDownloadProgress(regionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM download_progress WHERE region_id = ?",
    regionId,
  );
}
