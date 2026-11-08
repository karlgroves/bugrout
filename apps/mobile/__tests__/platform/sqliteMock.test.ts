/**
 * The in-memory mock database used where expo-sqlite is absent (web, Expo Go).
 *
 * It must not be more destructive than real SQLite (#299): a WHERE clause it
 * cannot evaluate used to fall through to "delete every row" and report
 * `changes: 0`, and a parameterised LIMIT or ORDER BY was ignored.
 */

jest.mock("expo-sqlite", () => {
  throw new Error("expo-sqlite unavailable");
});

import {
  isUsingInMemoryDatabase,
  isUsingMockDatabase,
  openDatabaseAsync,
  type SQLiteDatabase,
} from "@/platform/sqlite";

/** Insert a resource point row into the mock. */
async function addPoint(
  db: SQLiteDatabase,
  id: string,
  regionId: string,
  type: string,
): Promise<void> {
  await db.runAsync(
    "INSERT OR REPLACE INTO resource_points (id, region_id, type) VALUES (?, ?, ?)",
    id,
    regionId,
    type,
  );
}

describe("mock database", () => {
  let db: SQLiteDatabase;

  beforeEach(async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    db = await openDatabaseAsync("bugrout.db");
    await db.execAsync(
      "CREATE TABLE IF NOT EXISTS resource_points (id TEXT); CREATE TABLE IF NOT EXISTS threat_zones (id TEXT);",
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("is used only because the module is absent", () => {
    expect(isUsingMockDatabase()).toBe(true);
    expect(isUsingInMemoryDatabase()).toBe(true);
  });

  it("throws on a WHERE clause it cannot evaluate instead of wiping the table", async () => {
    await db.runAsync(
      "INSERT OR REPLACE INTO threat_zones (id, source) VALUES (?, ?)",
      "t1",
      "nws",
    );

    await expect(
      db.runAsync(
        "DELETE FROM threat_zones WHERE source = ? OR source = ?",
        "nws",
        "usfs",
      ),
    ).rejects.toThrow("cannot evaluate WHERE");
    await expect(
      db.runAsync("DELETE FROM threat_zones WHERE source LIKE ?", "n%"),
    ).rejects.toThrow("cannot evaluate WHERE");
    await expect(
      db.runAsync("DELETE FROM threat_zones WHERE source = ? AND", "nws"),
    ).rejects.toThrow("cannot evaluate WHERE");

    await expect(
      db.getAllAsync("SELECT * FROM threat_zones"),
    ).resolves.toHaveLength(1);
  });

  it("evaluates the expired-threat cleanup the app runs (IS NOT NULL, <)", async () => {
    for (const [id, expiresAt] of [
      ["expired", 40],
      ["live", 100],
      ["no-expiry", null],
    ] as const) {
      await db.runAsync(
        "INSERT OR REPLACE INTO threat_zones (id, expires_at) VALUES (?, ?)",
        id,
        expiresAt,
      );
    }

    // The statement in db/queries/threats.ts clearExpiredThreats().
    await expect(
      db.runAsync(
        "DELETE FROM threat_zones WHERE expires_at IS NOT NULL AND expires_at < ?",
        50,
      ),
    ).resolves.toEqual({ changes: 1 });

    const ids = (
      await db.getAllAsync<{ id: string }>("SELECT * FROM threat_zones")
    ).map((r) => r.id);
    expect(ids).toEqual(["live", "no-expiry"]);

    const idsWhere = async (clause: string): Promise<string[]> =>
      (
        await db.getAllAsync<{ id: string }>(
          `SELECT * FROM threat_zones WHERE ${clause}`,
        )
      ).map((r) => r.id);
    await expect(idsWhere("expires_at IS NULL")).resolves.toEqual([
      "no-expiry",
    ]);
    await expect(idsWhere("expires_at IS NOT NULL")).resolves.toEqual(["live"]);
  });

  it("applies every AND term of a delete and reports the true count", async () => {
    await addPoint(db, "a", "md", "shelter");
    await addPoint(db, "b", "md", "fuel");
    await addPoint(db, "c", "va", "shelter");

    await expect(
      db.runAsync(
        "DELETE FROM resource_points WHERE region_id = ? AND type = ?",
        "md",
        "shelter",
      ),
    ).resolves.toEqual({ changes: 1 });

    const ids = (
      await db.getAllAsync<{ id: string }>("SELECT * FROM resource_points")
    ).map((r) => r.id);
    expect(ids).toEqual(["b", "c"]);
  });

  it("reports the rows an unconditional delete removed", async () => {
    await addPoint(db, "a", "md", "shelter");
    await addPoint(db, "b", "md", "fuel");

    await expect(db.runAsync("DELETE FROM resource_points")).resolves.toEqual({
      changes: 2,
    });
  });

  it("applies every AND term of a select", async () => {
    await addPoint(db, "a", "md", "shelter");
    await addPoint(db, "b", "md", "fuel");

    const rows = await db.getAllAsync<{ id: string }>(
      "SELECT * FROM resource_points WHERE region_id = ? AND type = ?",
      "md",
      "fuel",
    );
    expect(rows.map((r) => r.id)).toEqual(["b"]);
  });

  it("evaluates the bounding-box select the app runs (BETWEEN ? AND ?)", async () => {
    for (const [id, lat, lng, type] of [
      ["inside", 39.0, -77.0, "fuel"],
      ["inside-shelter", 39.0, -77.0, "shelter"],
      ["edge", 39.5, -77.0, "fuel"],
      ["outside", 40.0, -77.0, "fuel"],
    ] as const) {
      await db.runAsync(
        "INSERT OR REPLACE INTO resource_points (id, lat, lng, type) VALUES (?, ?, ?, ?)",
        id,
        lat,
        lng,
        type,
      );
    }

    // The shape of db/queries/resources.ts getResourcesNearPoint(), with type.
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT * FROM resource_points
    WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? AND type = ?`,
      38.5,
      39.5,
      -77.5,
      -76.5,
      "fuel",
    );
    expect(rows.map((r) => r.id)).toEqual(["inside", "edge"]);
  });

  it("throws on a select WHERE it cannot evaluate instead of ignoring it", async () => {
    await expect(
      db.getAllAsync("SELECT * FROM resource_points WHERE lat IN (?, ?)", 1, 2),
    ).rejects.toThrow("cannot evaluate WHERE");
  });

  it("orders and applies a parameterised LIMIT", async () => {
    for (const [id, usedAt] of [
      ["a", 1],
      ["b", 3],
      ["c", 2],
    ] as const) {
      await db.runAsync(
        "INSERT OR REPLACE INTO recent_destinations (id, used_at) VALUES (?, ?)",
        id,
        usedAt,
      );
    }

    const rows = await db.getAllAsync<{ id: string }>(
      "SELECT * FROM recent_destinations ORDER BY used_at DESC LIMIT ?",
      2,
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "c"]);
  });
});
