/**
 * SQLite queries for downloaded regions.
 */

import { getDatabase } from "../database";

import type { DownloadedRegion, BBox } from "@bugrout/shared";

/**
 * Row shape of the `downloaded_regions` table, in the database's snake_case.
 */
interface DownloadedRegionRow {
  id: string;
  name: string;
  bbox: string;
  pmtiles_path: string;
  valhalla_tiles_path: string;
  downloaded_at: number;
  size_bytes: number;
  version: string;
}

/**
 * Maps a `downloaded_regions` row onto the shared domain type.
 *
 * `bbox` is stored as JSON text, so it is parsed here rather than at each call
 * site — keeping one mapper means the column list and the parse cannot drift
 * apart between the list and single-row queries.
 */
function toDownloadedRegion(row: DownloadedRegionRow): DownloadedRegion {
  return {
    id: row.id,
    name: row.name,
    bbox: JSON.parse(row.bbox) as BBox,
    pmtilesPath: row.pmtiles_path,
    valhallaTilesPath: row.valhalla_tiles_path,
    downloadedAt: row.downloaded_at,
    sizeBytes: row.size_bytes,
    version: row.version,
  };
}

/**
 * Inserts or replaces a downloaded region record.
 */
export async function insertDownloadedRegion(
  region: DownloadedRegion,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO downloaded_regions
     (id, name, bbox, pmtiles_path, valhalla_tiles_path, downloaded_at, size_bytes, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    region.id,
    region.name,
    JSON.stringify(region.bbox),
    region.pmtilesPath,
    region.valhallaTilesPath,
    region.downloadedAt,
    region.sizeBytes,
    region.version,
  );
}

/**
 * Returns all downloaded regions ordered by name.
 */
export async function getDownloadedRegions(): Promise<DownloadedRegion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<DownloadedRegionRow>(
    "SELECT * FROM downloaded_regions ORDER BY name",
  );

  return rows.map(toDownloadedRegion);
}

/**
 * Returns a downloaded region by id, or null if not found.
 */
export async function getDownloadedRegion(
  regionId: string,
): Promise<DownloadedRegion | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DownloadedRegionRow>(
    "SELECT * FROM downloaded_regions WHERE id = ?",
    regionId,
  );

  if (!row) return null;

  return toDownloadedRegion(row);
}

/**
 * Removes a downloaded region by id.
 */
export async function deleteDownloadedRegion(regionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM downloaded_regions WHERE id = ?", regionId);
}
