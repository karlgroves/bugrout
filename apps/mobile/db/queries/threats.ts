/**
 * SQLite queries for cached threat zones.
 */

import type { ThreatZone, ThreatType, ThreatSource } from "@bugrout/shared";
import { getDatabase } from "../database";

export async function upsertThreatZones(
  threats: ThreatZone[],
): Promise<void> {
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
    description: string;
    source: string;
    fetched_at: number;
    expires_at: number | null;
  }>(query, ...params);

  return rows.map((row) => ({
    id: row.id,
    type: row.type as ThreatType,
    severity: row.severity as ThreatZone["severity"],
    geometry: JSON.parse(row.geometry),
    headline: row.headline,
    description: row.description ?? "",
    source: row.source as ThreatSource,
    fetchedAt: row.fetched_at,
    expiresAt: row.expires_at,
  }));
}

export async function clearExpiredThreats(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM threat_zones WHERE expires_at IS NOT NULL AND expires_at < ?",
    Date.now(),
  );
}

export async function clearThreatsBySource(
  source: ThreatSource,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM threat_zones WHERE source = ?", source);
}
