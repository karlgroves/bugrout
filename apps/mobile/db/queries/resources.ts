/**
 * SQLite queries for cached resource points (fuel, water, shelter).
 */

import { getDatabase } from "../database";

import type { ResourcePoint, ResourceType } from "@bugrout/shared";

/** Raw resource_points row as stored in SQLite. */
interface ResourceRow {
  id: string;
  type: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  metadata: string | null;
  source: string;
  fetched_at: number;
  region_id: string;
}

/**
 * Maps a raw SQLite row to a ResourcePoint domain object.
 */
function rowToResourcePoint(row: ResourceRow): ResourcePoint {
  return {
    id: row.id,
    type: row.type as ResourceType,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    metadata: JSON.parse(row.metadata ?? "{}") as ResourcePoint["metadata"],
    source: row.source as ResourcePoint["source"],
    fetchedAt: row.fetched_at,
    regionId: row.region_id,
  };
}

/**
 * Inserts or replaces a batch of cached resource points.
 */
export async function upsertResourcePoints(
  resources: ResourcePoint[],
): Promise<void> {
  const db = await getDatabase();

  for (const r of resources) {
    await db.runAsync(
      `INSERT OR REPLACE INTO resource_points
       (id, type, name, lat, lng, address, metadata, source, fetched_at, region_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      r.id,
      r.type,
      r.name,
      r.lat,
      r.lng,
      r.address,
      JSON.stringify(r.metadata),
      r.source,
      r.fetchedAt,
      r.regionId,
    );
  }
}

/**
 * Returns cached resource points for a region, optionally filtered by type.
 */
export async function getResourcesByRegion(
  regionId: string,
  type?: ResourceType,
): Promise<ResourcePoint[]> {
  const db = await getDatabase();

  let query = "SELECT * FROM resource_points WHERE region_id = ?";
  const params: (string | number)[] = [regionId];

  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  const rows = await db.getAllAsync<ResourceRow>(query, ...params);
  return rows.map(rowToResourcePoint);
}

/**
 * Returns cached resource points within a bounding box around a point.
 */
export async function getResourcesNearPoint(
  lat: number,
  lng: number,
  radiusDegrees: number,
  type?: ResourceType,
): Promise<ResourcePoint[]> {
  const db = await getDatabase();

  let query = `SELECT * FROM resource_points
    WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`;
  const params: (string | number)[] = [
    lat - radiusDegrees,
    lat + radiusDegrees,
    lng - radiusDegrees,
    lng + radiusDegrees,
  ];

  if (type) {
    query += " AND type = ?";
    params.push(type);
  }

  const rows = await db.getAllAsync<ResourceRow>(query, ...params);
  return rows.map(rowToResourcePoint);
}

/**
 * Removes all cached resource points for a region.
 */
export async function deleteResourcesByRegion(regionId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM resource_points WHERE region_id = ?",
    regionId,
  );
}
