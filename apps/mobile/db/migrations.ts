/**
 * Data migrations run after the schema is created.
 *
 * The schema is `CREATE TABLE IF NOT EXISTS`, so it never changes existing
 * rows. Fixes to data already on a device go here. Each migration must be
 * idempotent, because it runs on every launch, and safe to interrupt, because
 * it runs without a transaction (the in-memory mock used by web and Expo Go
 * has none).
 */

import { placeKey } from "@/utils/geo";

import type { SQLiteDatabase } from "@/platform/sqlite";

/**
 * Collapse recent destinations recorded before they were keyed by place.
 *
 * Until #191 every trip was stored under a random id, so a place used three
 * times was listed three times. This keeps the most recent row per place, under
 * its place key, and removes the rest. The surviving row is written before any
 * row is deleted, so an interrupted run loses nothing and the next launch
 * finishes it.
 *
 * @param db - An open database with the schema created.
 * @returns How many rows were removed.
 */
export async function collapseRecentDestinations(
  db: SQLiteDatabase,
): Promise<number> {
  const rows = await db.getAllAsync<{
    id: string;
    label: string | null;
    lat: number;
    lng: number;
    used_at: number;
  }>("SELECT * FROM recent_destinations ORDER BY used_at DESC");

  const stale = rows.filter((r) => r.id !== placeKey(r));
  if (stale.length === 0) return 0;

  // Newest first, so the first row seen for a place is the one to keep.
  const keep = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = placeKey(row);
    if (!keep.has(key)) keep.set(key, row);
  }

  for (const [key, row] of keep) {
    if (row.id === key) continue;
    await db.runAsync(
      `INSERT OR REPLACE INTO recent_destinations (id, label, lat, lng, used_at)
       VALUES (?, ?, ?, ?, ?)`,
      key,
      row.label,
      row.lat,
      row.lng,
      row.used_at,
    );
  }

  for (const row of stale) {
    await db.runAsync("DELETE FROM recent_destinations WHERE id = ?", row.id);
  }

  return rows.length - keep.size;
}

/**
 * Run every data migration. A failure is logged and doesn't fail start-up:
 * these tidy existing data, and the app works without them.
 *
 * @param db - An open database with the schema created.
 */
export async function runDataMigrations(db: SQLiteDatabase): Promise<void> {
  try {
    await collapseRecentDestinations(db);
  } catch (err) {
    console.warn("[BugRout] Data migration failed; continuing:", err);
  }
}
