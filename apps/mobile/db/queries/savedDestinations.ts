/**
 * SQLite queries for saved destinations (#187).
 *
 * Places set up ahead of time in Settings — a relative's house, a shelter, a
 * rally point — so they are one tap away at bug-out time. Simpler than plans:
 * a name and a place, no stop preferences, and a higher cap. On-device only.
 */

import { getDatabase } from "../database";

import type { LatLng } from "@bugrout/shared";

export /** How many saved destinations can be kept; plans are capped at 3. */
const MAX_SAVED_DESTINATIONS = 10;

/** A destination saved in Settings. */
export interface SavedDestination {
  id: string;
  name: string;
  point: LatLng;
  /** The address it was saved by, or `null` for a dropped pin. */
  address: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Inserts or replaces a saved destination.
 */
export async function upsertSavedDestination(
  dest: SavedDestination,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO saved_destinations
     (id, name, lat, lng, address, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    dest.id,
    dest.name,
    dest.point.lat,
    dest.point.lng,
    dest.address,
    dest.createdAt,
    dest.updatedAt,
  );
}

/**
 * Returns every saved destination, oldest first, so the list keeps the order
 * the user built it in.
 */
export async function getSavedDestinations(): Promise<SavedDestination[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    address: string | null;
    created_at: number;
    updated_at: number;
  }>("SELECT * FROM saved_destinations ORDER BY created_at ASC");

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    point: { lat: row.lat, lng: row.lng },
    address: row.address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Removes a saved destination by id.
 */
export async function deleteSavedDestination(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM saved_destinations WHERE id = ?", id);
}
