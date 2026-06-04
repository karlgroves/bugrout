/**
 * SQLite queries for downloaded regions.
 */

import type { DownloadedRegion, BBox } from "@bugrout/shared";
import { getDatabase } from "../database";

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

export async function getDownloadedRegions(): Promise<DownloadedRegion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    bbox: string;
    pmtiles_path: string;
    valhalla_tiles_path: string;
    downloaded_at: number;
    size_bytes: number;
    version: string;
  }>("SELECT * FROM downloaded_regions ORDER BY name");

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    bbox: JSON.parse(row.bbox) as BBox,
    pmtilesPath: row.pmtiles_path,
    valhallaTilesPath: row.valhalla_tiles_path,
    downloadedAt: row.downloaded_at,
    sizeBytes: row.size_bytes,
    version: row.version,
  }));
}

export async function getDownloadedRegion(
  regionId: string,
): Promise<DownloadedRegion | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    id: string;
    name: string;
    bbox: string;
    pmtiles_path: string;
    valhalla_tiles_path: string;
    downloaded_at: number;
    size_bytes: number;
    version: string;
  }>("SELECT * FROM downloaded_regions WHERE id = ?", regionId);

  if (!row) return null;

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

export async function deleteDownloadedRegion(
  regionId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM downloaded_regions WHERE id = ?", regionId);
}
