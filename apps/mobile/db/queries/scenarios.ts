/**
 * SQLite queries for saved evacuation scenarios.
 */

import { getDatabase } from "../database";

import type { Scenario } from "@bugrout/shared";

/**
 * Inserts or replaces a saved evacuation scenario.
 */
export async function upsertScenario(scenario: Scenario): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO scenarios
     (id, name, destination_lat, destination_lng, avoid_zones, resource_stops, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    scenario.id,
    scenario.name,
    scenario.destination.lat,
    scenario.destination.lng,
    JSON.stringify(scenario.avoidZones),
    JSON.stringify(scenario.resourceStops),
    scenario.createdAt,
    scenario.updatedAt,
  );
}

/**
 * Returns all saved scenarios ordered by most recently created.
 */
export async function getScenarios(): Promise<Scenario[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    destination_lat: number;
    destination_lng: number;
    avoid_zones: string | null;
    resource_stops: string | null;
    created_at: number;
    updated_at: number;
  }>("SELECT * FROM scenarios ORDER BY created_at DESC");

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    destination: { lat: row.destination_lat, lng: row.destination_lng },
    avoidZones: JSON.parse(row.avoid_zones ?? "[]") as Scenario["avoidZones"],
    resourceStops: JSON.parse(
      row.resource_stops ?? "[]",
    ) as Scenario["resourceStops"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Removes a saved scenario by id.
 */
export async function deleteScenario(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM scenarios WHERE id = ?", id);
}
