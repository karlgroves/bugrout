/**
 * Saved destinations persist in SQLite (#187).
 *
 * Run against real SQLite (Node's built-in `node:sqlite`), schema included,
 * because "survives an app restart and update" is a property of the statements
 * and of `CREATE TABLE IF NOT EXISTS` re-running on every start.
 */

import { DatabaseSync } from "node:sqlite";

import {
  deleteSavedDestination,
  getSavedDestinations,
  upsertSavedDestination,
  type SavedDestination,
} from "@/db/queries/savedDestinations";
import { CREATE_TABLES_SQL } from "@/db/schema";

import type { SQLiteDatabase } from "@/platform/sqlite";

type SqlParam = string | number | null;

let raw: DatabaseSync;

/** The app's database interface over the in-memory node:sqlite database. */
function wrap(): SQLiteDatabase {
  return {
    execAsync: (sql) => {
      raw.exec(sql);
      return Promise.resolve();
    },
    runAsync: (sql, ...params) => {
      const result = raw.prepare(sql).run(...(params as SqlParam[]));
      return Promise.resolve({ changes: Number(result.changes) });
    },
    getAllAsync: <T>(sql: string, ...params: unknown[]) =>
      Promise.resolve(raw.prepare(sql).all(...(params as SqlParam[])) as T[]),
    getFirstAsync: <T>(sql: string, ...params: unknown[]) =>
      Promise.resolve(
        (raw.prepare(sql).get(...(params as SqlParam[])) as T | undefined) ??
          null,
      ),
    closeAsync: () => {
      raw.close();
      return Promise.resolve();
    },
  };
}

let mockDb: SQLiteDatabase;

jest.mock("@/db/database", () => ({
  getDatabase: () => Promise.resolve(mockDb),
}));

/** A saved destination with sensible defaults. */
function dest(overrides: Partial<SavedDestination>): SavedDestination {
  return {
    id: "d1",
    name: "Mom's house",
    point: { lat: 39.3138, lng: -76.6021 },
    address: "120 Main St, Towson, Maryland",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  raw = new DatabaseSync(":memory:");
  mockDb = wrap();
  await mockDb.execAsync(CREATE_TABLES_SQL);
});

afterEach(async () => {
  await mockDb.closeAsync();
});

describe("saved destinations queries", () => {
  it("reads back what was saved, address and coordinates both", async () => {
    await upsertSavedDestination(dest({}));

    expect(await getSavedDestinations()).toEqual([dest({})]);
  });

  it("keeps a dropped pin's missing address as null", async () => {
    await upsertSavedDestination(dest({ address: null }));

    const [saved] = await getSavedDestinations();
    expect(saved?.address).toBeNull();
  });

  it("lists them in the order they were added", async () => {
    await upsertSavedDestination(dest({ id: "b", name: "B", createdAt: 2 }));
    await upsertSavedDestination(dest({ id: "a", name: "A", createdAt: 1 }));

    const names = (await getSavedDestinations()).map((d) => d.name);
    expect(names).toEqual(["A", "B"]);
  });

  it("renames in place rather than adding a second entry", async () => {
    await upsertSavedDestination(dest({}));
    await upsertSavedDestination(dest({ name: "Grandma's", updatedAt: 2 }));

    const all = await getSavedDestinations();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: "Grandma's", createdAt: 1 });
  });

  it("deletes by id", async () => {
    await upsertSavedDestination(dest({ id: "keep" }));
    await upsertSavedDestination(dest({ id: "drop" }));

    await deleteSavedDestination("drop");

    const ids = (await getSavedDestinations()).map((d) => d.id);
    expect(ids).toEqual(["keep"]);
  });

  it("survives the schema re-running on the next start", async () => {
    await upsertSavedDestination(dest({}));

    // What every launch, and every update, does before anything else.
    await mockDb.execAsync(CREATE_TABLES_SQL);

    expect(await getSavedDestinations()).toHaveLength(1);
  });
});
