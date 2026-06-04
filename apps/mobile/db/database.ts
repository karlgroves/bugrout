/**
 * SQLite Database Manager
 *
 * Initializes and provides access to the local SQLite database.
 * All offline data persistence goes through this module.
 *
 * Error recovery:
 * - Falls back to in-memory mock when expo-sqlite is unavailable
 * - On corruption, deletes the database and recreates
 * - All queries are wrapped in try/catch at the caller level
 */

import { deleteAsync, documentDirectory } from "@/platform/fileSystem";
import {
  openDatabaseAsync,
  isUsingMockDatabase,
  type SQLiteDatabase,
} from "@/platform/sqlite";

import { CREATE_TABLES_SQL } from "./schema";

const DB_NAME = "bugrout.db";

let db: SQLiteDatabase | null = null;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 2;

/**
 * Get or initialize the database connection.
 * Creates all tables on first run.
 * On corruption, drops and recreates the database.
 */
export async function getDatabase(): Promise<SQLiteDatabase> {
  if (db) return db;

  try {
    db = await openDatabaseAsync(DB_NAME);

    if (!isUsingMockDatabase()) {
      await db.execAsync("PRAGMA journal_mode = WAL;");
      // Integrity check on first open
      await db.execAsync("PRAGMA integrity_check;");
    }

    await db.execAsync(CREATE_TABLES_SQL);
    initAttempts = 0;
    return db;
  } catch (error) {
    initAttempts++;
    console.error(
      `[BugRout] Database init failed (attempt ${initAttempts}):`,
      error,
    );

    if (initAttempts < MAX_INIT_ATTEMPTS) {
      // Database may be corrupt — try to recover by recreating
      console.warn("[BugRout] Attempting database recovery...");
      db = null;

      try {
        // Delete the corrupt database
        await deleteAsync(`${documentDirectory}SQLite/${DB_NAME}`, {
          idempotent: true,
        });
      } catch {
        // Can't delete — proceed with fresh open
      }

      // Retry
      return getDatabase();
    }

    // Give up on native, fall back to in-memory mock
    console.warn("[BugRout] Using in-memory database after recovery failure.");
    const { openDatabaseAsync: openMock } = await import("@/platform/sqlite");
    db = await openMock("mock-recovery.db");
    await db.execAsync(CREATE_TABLES_SQL);
    return db;
  }
}

/**
 * Close the database connection.
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}

/**
 * Check if the database is using the in-memory mock.
 */
export function isDatabaseMocked(): boolean {
  return isUsingMockDatabase();
}

export type { SQLiteDatabase };
