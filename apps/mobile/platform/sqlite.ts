/**
 * SQLite platform abstraction.
 * Uses expo-sqlite when available, falls back to in-memory mock for Expo Go.
 */

import { Platform } from "react-native";

/**
 *
 */
export interface SQLiteDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  closeAsync(): Promise<void>;
}

let usingMock = false;

/**
 * Reports whether the in-memory mock database is in use (web / Expo Go)
 * rather than a real expo-sqlite database.
 */
export function isUsingMockDatabase(): boolean {
  return usingMock;
}

/**
 * Opens (or creates) a SQLite database, falling back to an in-memory mock
 * when expo-sqlite is unavailable (web preview / Expo Go).
 */
export async function openDatabaseAsync(name: string): Promise<SQLiteDatabase> {
  // On web, expo-sqlite's WASM bundling breaks Metro. Skip entirely.
  if (Platform.OS === "web") {
    console.warn("[BugRout] Using in-memory mock database (web preview).");
    usingMock = true;
    return createMockDatabase();
  }

  try {
    // Dynamic require with variable to prevent Metro static analysis
    const moduleName = "expo-sqlite";
    const SQLite = require(moduleName);
    return await SQLite.openDatabaseAsync(name);
  } catch {
    console.warn(
      "[BugRout] expo-sqlite not available (Expo Go). Using in-memory mock database.",
    );
    usingMock = true;
    return createMockDatabase();
  }
}

/**
 * In-memory table store for the mock database, keyed by table name.
 */
type MockTables = Map<string, unknown[]>;

/**
 * Handles a mock CREATE TABLE statement by registering any new table names.
 */
function mockCreateTables(tables: MockTables, sql: string): void {
  const createMatches = sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g);
  for (const match of createMatches) {
    const tableName = match[1];
    if (tableName && !tables.has(tableName)) {
      tables.set(tableName, []);
    }
  }
}

/**
 * Handles a mock INSERT OR REPLACE statement, returning the affected-row
 * count, or null if the SQL is not an insert this mock understands.
 */
function mockInsert(
  tables: MockTables,
  sql: string,
  params: unknown[],
): { changes: number } | null {
  const insertMatch =
    /INSERT OR REPLACE INTO (\w+)\s*\(([^)]+)\)\s*VALUES/i.exec(sql);
  const table = insertMatch?.[1];
  const colsRaw = insertMatch?.[2];
  if (!insertMatch || !table || !colsRaw) return null;

  const cols = colsRaw.split(",").map((c) => c.trim());
  const row: Record<string, unknown> = {};
  cols.forEach((col, i) => {
    row[col] = params[i];
  });

  let rows = tables.get(table);
  if (!rows) {
    rows = [];
    tables.set(table, rows);
  }

  // Replace existing row with same first column (assumed PK)
  const pkCol = cols[0];
  const idx = pkCol
    ? rows.findIndex(
        (r) => (r as Record<string, unknown>)[pkCol] === params[0],
      )
    : -1;
  if (idx >= 0) {
    rows[idx] = row;
  } else {
    rows.push(row);
  }

  return { changes: 1 };
}

/**
 * Handles a mock DELETE statement, returning the affected-row count, or null
 * if the SQL is not a delete this mock understands.
 */
function mockDelete(
  tables: MockTables,
  sql: string,
  params: unknown[],
): { changes: number } | null {
  const deleteMatch = /DELETE FROM (\w+)/i.exec(sql);
  const table = deleteMatch?.[1];
  if (!table) return null;

  const existingRows = tables.get(table);
  if (!existingRows) return { changes: 0 };

  const whereMatch = /WHERE (\w+)\s*=\s*\?/i.exec(sql);
  const col = whereMatch?.[1];
  if (col && params.length > 0) {
    const before = existingRows.length;
    tables.set(
      table,
      existingRows.filter(
        (r) => (r as Record<string, unknown>)[col] !== params[0],
      ),
    );
    return { changes: before - (tables.get(table)?.length ?? 0) };
  }

  tables.set(table, []);
  return { changes: 0 };
}

/**
 * Handles a mock SELECT statement with basic WHERE and LIMIT support.
 */
function mockSelect<T>(
  tables: MockTables,
  sql: string,
  params: unknown[],
): T[] {
  const match = /FROM (\w+)/i.exec(sql);
  const table = match?.[1];
  if (!table) return [];
  const rows = (tables.get(table) ?? []) as T[];

  // Basic WHERE filtering
  const whereMatch = /WHERE (\w+)\s*=\s*\?/i.exec(sql);
  const col = whereMatch?.[1];
  if (col && params.length > 0) {
    return rows.filter(
      (r) => (r as Record<string, unknown>)[col] === params[0],
    );
  }

  // Basic LIMIT
  const limitMatch = /LIMIT (\d+)/i.exec(sql);
  if (limitMatch?.[1]) {
    return rows.slice(0, parseInt(limitMatch[1], 10));
  }

  return rows;
}

/**
 * In-memory mock database for Expo Go preview.
 * Stores data in Maps keyed by table name.
 * Supports basic INSERT/SELECT/DELETE — enough for UI preview.
 */
function createMockDatabase(): SQLiteDatabase {
  const tables: MockTables = new Map<string, unknown[]>();

  return {
    execAsync(sql: string): Promise<void> {
      mockCreateTables(tables, sql);
      return Promise.resolve();
    },

    runAsync(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
      const result =
        mockInsert(tables, sql, params) ?? mockDelete(tables, sql, params);
      return Promise.resolve(result ?? { changes: 0 });
    },

    getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      return Promise.resolve(mockSelect<T>(tables, sql, params));
    },

    async getFirstAsync<T>(
      sql: string,
      ...params: unknown[]
    ): Promise<T | null> {
      const rows = await this.getAllAsync<T>(sql, ...params);
      return rows[0] ?? null;
    },

    closeAsync(): Promise<void> {
      tables.clear();
      return Promise.resolve();
    },
  };
}
