/**
 * Recent destinations are one entry per place (#191).
 *
 * Every trip used to be stored under a new random id, so `INSERT OR REPLACE`
 * never replaced anything and a place used three times was listed three
 * times. These tests run the real SQL, schema included, against SQLite
 * (Node's built-in `node:sqlite`) rather than the regex mock the app uses on
 * web, because the bug was in what the statements do to real rows.
 */

import { DatabaseSync } from "node:sqlite";

import { collapseRecentDestinations } from "@/db/migrations";
import {
  addRecentDestination,
  getRecentDestinations,
} from "@/db/queries/preferences";
import { CREATE_TABLES_SQL } from "@/db/schema";

import type { SQLiteDatabase } from "@/platform/sqlite";

type SqlParam = string | number | null;

/** The app's database interface over an in-memory node:sqlite database. */
function openTestDatabase(): SQLiteDatabase {
  const raw = new DatabaseSync(":memory:");
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

const BALTIMORE = { lat: 39.3138, lng: -76.6021 };

beforeEach(async () => {
  mockDb = openTestDatabase();
  await mockDb.execAsync(CREATE_TABLES_SQL);
});

afterEach(async () => {
  await mockDb.closeAsync();
});

describe("addRecentDestination", () => {
  it("keeps one entry for a place used twice, with the latest label and time", async () => {
    await addRecentDestination({ label: "Map pin", ...BALTIMORE, usedAt: 1 });
    await addRecentDestination({ label: "Home", ...BALTIMORE, usedAt: 2 });

    const recents = await getRecentDestinations();
    expect(recents).toHaveLength(1);
    expect(recents[0]).toMatchObject({ label: "Home", usedAt: 2 });
  });

  it("moves a reused place to the top", async () => {
    await addRecentDestination({ label: "A", ...BALTIMORE, usedAt: 1 });
    await addRecentDestination({
      label: "B",
      lat: 39.2,
      lng: -76.5,
      usedAt: 2,
    });
    await addRecentDestination({ label: "A again", ...BALTIMORE, usedAt: 3 });

    const labels = (await getRecentDestinations()).map((r) => r.label);
    expect(labels).toEqual(["A again", "B"]);
  });

  it("treats points within the ~11 m rounding as the same place", async () => {
    await addRecentDestination({ label: "x", ...BALTIMORE, usedAt: 1 });
    await addRecentDestination({
      label: "y",
      lat: BALTIMORE.lat + 0.00001,
      lng: BALTIMORE.lng - 0.00001,
      usedAt: 2,
    });

    expect(await getRecentDestinations()).toHaveLength(1);
  });

  it("keeps two genuinely different places close together apart", async () => {
    // 0.0002° of latitude is about 22 m, beyond the rounding.
    await addRecentDestination({ label: "x", ...BALTIMORE, usedAt: 1 });
    await addRecentDestination({
      label: "y",
      lat: BALTIMORE.lat + 0.0002,
      lng: BALTIMORE.lng,
      usedAt: 2,
    });

    expect(await getRecentDestinations()).toHaveLength(2);
  });
});

describe("collapseRecentDestinations (upgrade from random ids)", () => {
  /** Insert a row the way builds before #191 did: a random id per trip. */
  async function legacyRow(row: {
    id: string;
    label: string;
    lat: number;
    lng: number;
    usedAt: number;
  }): Promise<void> {
    await mockDb.runAsync(
      "INSERT INTO recent_destinations (id, label, lat, lng, used_at) VALUES (?, ?, ?, ?, ?)",
      row.id,
      row.label,
      row.lat,
      row.lng,
      row.usedAt,
    );
  }

  it("collapses duplicates to the most recent row per place", async () => {
    await legacyRow({ id: "u1", label: "Map pin", ...BALTIMORE, usedAt: 1 });
    await legacyRow({ id: "u2", label: "Map pin", ...BALTIMORE, usedAt: 3 });
    await legacyRow({
      id: "u3",
      label: "Map pin (old)",
      ...BALTIMORE,
      usedAt: 2,
    });
    await legacyRow({
      id: "u4",
      label: "Annapolis",
      lat: 38.9784,
      lng: -76.4922,
      usedAt: 4,
    });

    expect(await collapseRecentDestinations(mockDb)).toBe(2);

    const recents = await getRecentDestinations();
    expect(recents.map((r) => [r.label, r.usedAt])).toEqual([
      ["Annapolis", 4],
      ["Map pin", 3],
    ]);
  });

  it("re-keys the survivors so the next use replaces them", async () => {
    await legacyRow({ id: "u1", label: "Map pin", ...BALTIMORE, usedAt: 1 });
    await collapseRecentDestinations(mockDb);

    await addRecentDestination({ label: "Home", ...BALTIMORE, usedAt: 5 });

    expect(await getRecentDestinations()).toHaveLength(1);
  });

  it("does nothing once the rows are keyed by place", async () => {
    await addRecentDestination({ label: "Home", ...BALTIMORE, usedAt: 1 });

    expect(await collapseRecentDestinations(mockDb)).toBe(0);
    expect(await getRecentDestinations()).toHaveLength(1);
  });
});
