/**
 * SQLite queries for downloaded regions.
 */

import { documentDirectory } from "@/platform/fileSystem";

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
 * Where region files live, relative to the documents directory. TileManager
 * downloads to `<documentDirectory>tiles/<id>/`.
 */
const TILES_SEGMENT = "tiles/";

/**
 * The form a region file path is stored in: relative to the documents
 * directory, e.g. `tiles/md/md.pmtiles`.
 *
 * iOS doesn't keep an app's data-container path across installs and updates,
 * so an absolute path stored at download time stops resolving after one, and
 * the offline map goes blank (#185). A path outside the documents directory is
 * stored unchanged.
 *
 * @param path - An absolute path under the current documents directory.
 * @returns The path relative to the documents directory.
 */
export function toStoredPath(path: string): string {
  return path.startsWith(documentDirectory)
    ? path.slice(documentDirectory.length)
    : path;
}

/**
 * Resolves a stored region file path against the current documents directory.
 *
 * Handles both forms: a relative path, as stored since #185, and an absolute
 * one written by an earlier build, which may point into a data container that
 * no longer exists. The latter is rebased from its `tiles/` segment, so a
 * device that downloaded a region before an update keeps it without
 * downloading again.
 *
 * @param stored - The path as stored in `downloaded_regions`.
 * @returns An absolute path in the current documents directory, or the stored
 *   value unchanged when it is empty or not a region file path.
 */
export function resolveStoredPath(stored: string): string {
  if (!stored) return stored;
  if (!stored.startsWith("/") && !/^[a-z]+:/i.test(stored)) {
    return `${documentDirectory}${stored}`;
  }
  const at = stored.indexOf(`/${TILES_SEGMENT}`);
  return at === -1 ? stored : `${documentDirectory}${stored.slice(at + 1)}`;
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
    pmtilesPath: resolveStoredPath(row.pmtiles_path),
    valhallaTilesPath: resolveStoredPath(row.valhalla_tiles_path),
    downloadedAt: row.downloaded_at,
    sizeBytes: row.size_bytes,
    version: row.version,
  };
}

/**
 * Inserts or replaces a downloaded region record. File paths are stored
 * relative to the documents directory ({@link toStoredPath}).
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
    toStoredPath(region.pmtilesPath),
    toStoredPath(region.valhallaTilesPath),
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
