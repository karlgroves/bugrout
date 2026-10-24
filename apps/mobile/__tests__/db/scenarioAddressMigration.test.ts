/**
 * Adding `scenarios.destination_address` to a table that predates it (#187).
 *
 * This is the upgrade path, and it is the part that can lose a user their
 * plans. The schema is `CREATE TABLE IF NOT EXISTS`, so a device that already
 * has the table never gets the new column from it. Reading survives that —
 * `getScenarios` selects `*` — but `upsertScenario` names the column, so
 * without the migration every save fails on an upgraded install.
 *
 * The migration runs on every launch, so it also has to be safe to run twice.
 */
import { addScenarioAddressColumn } from "@/db/migrations";

import type { SQLiteDatabase } from "@/platform/sqlite";

/** Columns the fake database reports for `scenarios`. */
let columns: { name: string }[] = [];
let executed: string[] = [];

const db = {
  getAllAsync: (sql: string) => {
    if (sql.includes("PRAGMA table_info(scenarios)")) {
      return Promise.resolve(columns);
    }
    return Promise.resolve([]);
  },
  execAsync: (sql: string) => {
    executed.push(sql);
    if (/ALTER TABLE scenarios ADD COLUMN (\w+)/.exec(sql)) {
      const match = /ADD COLUMN (\w+)/.exec(sql);
      if (match?.[1]) {
        // A real ALTER throws if the column is already there; this fake
        // mirrors that so a double-add would be caught rather than tolerated.
        if (columns.some((c) => c.name === match[1])) {
          return Promise.reject(
            new Error(`duplicate column name: ${match[1]}`),
          );
        }
        columns.push({ name: match[1] });
      }
    }
    return Promise.resolve();
  },
} as unknown as SQLiteDatabase;

/** The columns a pre-#187 scenarios table has. */
const BEFORE = [
  "id",
  "name",
  "destination_lat",
  "destination_lng",
  "avoid_zones",
  "resource_stops",
  "created_at",
  "updated_at",
].map((name) => ({ name }));

beforeEach(() => {
  columns = BEFORE.map((c) => ({ ...c }));
  executed = [];
});

describe("addScenarioAddressColumn", () => {
  it("adds the column to a table that predates it", async () => {
    expect(await addScenarioAddressColumn(db)).toBe(true);
    expect(columns.map((c) => c.name)).toContain("destination_address");
  });

  it("does nothing the second time, and does not throw", async () => {
    await addScenarioAddressColumn(db);
    executed = [];

    expect(await addScenarioAddressColumn(db)).toBe(false);
    expect(executed).toEqual([]);
  });

  it("leaves a table that already has the column alone", async () => {
    columns.push({ name: "destination_address" });
    expect(await addScenarioAddressColumn(db)).toBe(false);
    expect(executed).toEqual([]);
  });

  it("keeps every existing column", async () => {
    await addScenarioAddressColumn(db);
    for (const { name } of BEFORE) {
      expect(columns.map((c) => c.name)).toContain(name);
    }
  });
});
