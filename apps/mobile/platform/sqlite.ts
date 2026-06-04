/**
 * SQLite platform abstraction.
 * Uses expo-sqlite when available, falls back to in-memory mock for Expo Go.
 */

import { Platform } from "react-native";

export interface SQLiteDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  closeAsync(): Promise<void>;
}

let _usingMock = false;

export function isUsingMockDatabase(): boolean {
  return _usingMock;
}

export async function openDatabaseAsync(name: string): Promise<SQLiteDatabase> {
  // On web, expo-sqlite's WASM bundling breaks Metro. Skip entirely.
  if (Platform.OS === "web") {
    console.warn("[BugRout] Using in-memory mock database (web preview).");
    _usingMock = true;
    return createMockDatabase();
  }

  try {
    // Dynamic require with variable to prevent Metro static analysis
    const moduleName = "expo-sqlite";
    const SQLite = require(moduleName);
    const db = await SQLite.openDatabaseAsync(name);
    return db;
  } catch {
    console.warn(
      "[BugRout] expo-sqlite not available (Expo Go). Using in-memory mock database.",
    );
    _usingMock = true;
    return createMockDatabase();
  }
}

/**
 * In-memory mock database for Expo Go preview.
 * Stores data in Maps keyed by table name.
 * Supports basic INSERT/SELECT/DELETE — enough for UI preview.
 */
function createMockDatabase(): SQLiteDatabase {
  const tables = new Map<string, unknown[]>();

  return {
    async execAsync(sql: string) {
      // Parse CREATE TABLE statements to initialize tables
      const createMatches = sql.matchAll(
        /CREATE TABLE IF NOT EXISTS (\w+)/g,
      );
      for (const match of createMatches) {
        const tableName = match[1];
        if (tableName && !tables.has(tableName)) {
          tables.set(tableName, []);
        }
      }
    },

    async runAsync(sql: string, ...params: unknown[]) {
      // Basic INSERT OR REPLACE support
      const insertMatch = sql.match(
        /INSERT OR REPLACE INTO (\w+)\s*\(([^)]+)\)\s*VALUES/i,
      );
      const table = insertMatch?.[1];
      const colsRaw = insertMatch?.[2];
      if (insertMatch && table && colsRaw) {
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

      // Basic DELETE support
      const deleteMatch = sql.match(/DELETE FROM (\w+)/i);
      const deleteTable = deleteMatch?.[1];
      if (deleteTable) {
        const table = deleteTable;
        const existingRows = tables.get(table);
        if (existingRows) {
          const whereMatch = sql.match(/WHERE (\w+)\s*=\s*\?/i);
          const col = whereMatch?.[1];
          if (col && params.length > 0) {
            const rows = existingRows;
            const before = rows.length;
            tables.set(
              table,
              rows.filter(
                (r) => (r as Record<string, unknown>)[col] !== params[0],
              ),
            );
            return { changes: before - (tables.get(table)?.length ?? 0) };
          }
          tables.set(table, []);
        }
        return { changes: 0 };
      }

      return { changes: 0 };
    },

    async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      const match = sql.match(/FROM (\w+)/i);
      const table = match?.[1];
      if (!table) return [];
      const rows = (tables.get(table) ?? []) as T[];

      // Basic WHERE filtering
      const whereMatch = sql.match(/WHERE (\w+)\s*=\s*\?/i);
      const col = whereMatch?.[1];
      if (col && params.length > 0) {
        return rows.filter(
          (r) => (r as Record<string, unknown>)[col] === params[0],
        );
      }

      // Basic LIMIT
      const limitMatch = sql.match(/LIMIT (\d+)/i);
      if (limitMatch?.[1]) {
        return rows.slice(0, parseInt(limitMatch[1], 10));
      }

      return rows;
    },

    async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
      const rows = await this.getAllAsync<T>(sql, ...params);
      return rows[0] ?? null;
    },

    async closeAsync() {
      tables.clear();
    },
  };
}
