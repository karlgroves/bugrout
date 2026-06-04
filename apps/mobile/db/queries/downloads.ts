/**
 * SQLite queries for tracking download progress.
 */

import { getDatabase } from "../database";

/**
 * Lifecycle status of a region tile download.
 */
export type DownloadStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "complete"
  | "error";

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
 * Returns the download progress for a region, or null if none is tracked.
 */
export async function getDownloadProgress(
  regionId: string,
): Promise<DownloadProgressRow | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    region_id: string;
    bytes_downloaded: number;
    total_bytes: number;
    status: string;
  }>("SELECT * FROM download_progress WHERE region_id = ?", regionId);

  if (!row) return null;

  return {
    regionId: row.region_id,
    bytesDownloaded: row.bytes_downloaded,
    totalBytes: row.total_bytes,
    status: row.status as DownloadStatus,
  };
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
export async function deleteDownloadProgress(
  regionId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM download_progress WHERE region_id = ?",
    regionId,
  );
}

/**
 * Returns all tracked download progress records.
 */
export async function getAllDownloadProgress(): Promise<
  DownloadProgressRow[]
> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    region_id: string;
    bytes_downloaded: number;
    total_bytes: number;
    status: string;
  }>("SELECT * FROM download_progress");

  return rows.map((r) => ({
    regionId: r.region_id,
    bytesDownloaded: r.bytes_downloaded,
    totalBytes: r.total_bytes,
    status: r.status as DownloadStatus,
  }));
}
