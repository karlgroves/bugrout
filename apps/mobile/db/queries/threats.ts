/**
 * SQLite queries for cached threat zones.
 */

import { sanitizeThreatGeometry } from "@/utils/geo";

import { getDatabase } from "../database";

import type { ThreatZone, ThreatType, ThreatSource } from "@bugrout/shared";

/**
 * Inserts or replaces a batch of cached threat zones.
 */
export async function upsertThreatZones(threats: ThreatZone[]): Promise<void> {
  const db = await getDatabase();

  for (const t of threats) {
    await db.runAsync(
      `INSERT OR REPLACE INTO threat_zones
       (id, type, severity, geometry, headline, description, source, fetched_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.id,
      t.type,
      t.severity,
      JSON.stringify(t.geometry),
      t.headline,
      t.description,
      t.source,
      t.fetchedAt,
      t.expiresAt,
    );
  }
}

/**
 * Returns cached threat zones, optionally filtered by source.
 */
export async function getCachedThreats(
  source?: ThreatSource,
): Promise<ThreatZone[]> {
  const db = await getDatabase();

  let query = "SELECT * FROM threat_zones";
  const params: string[] = [];

  if (source) {
    query += " WHERE source = ?";
    params.push(source);
  }

  const rows = await db.getAllAsync<{
    id: string;
    type: string;
    severity: string;
    geometry: string;
    headline: string;
    description: string | null;
    source: string;
    fetched_at: number;
    expires_at: number | null;
  }>(query, ...params);

  // A row written by an older build, before geometry was validated at ingest,
  // must not poison routing or the map: re-check it on the way out (#287).
  return rows.flatMap((row) => {
    const geometry = sanitizeThreatGeometry(parseJson(row.geometry));
    if (geometry === null) return [];
    return [
      {
        id: row.id,
        type: row.type as ThreatType,
        severity: row.severity as ThreatZone["severity"],
        geometry,
        headline: row.headline,
        description: row.description ?? "",
        source: row.source as ThreatSource,
        fetchedAt: row.fetched_at,
        expiresAt: row.expires_at,
      },
    ];
  });
}

/** Parse stored JSON, reading unparseable text as `null`. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Deletes cached threat zones whose expiry time has passed.
 */
export async function clearExpiredThreats(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM threat_zones WHERE expires_at IS NOT NULL AND expires_at < ?",
    Date.now(),
  );
}

/**
 * Deletes all cached threat zones from a given source.
 */
export async function clearThreatsBySource(
  source: ThreatSource,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM threat_zones WHERE source = ?", source);
}
