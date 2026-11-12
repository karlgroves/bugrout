/**
 * SQLite Database Manager
 *
 * Initializes and provides access to the local SQLite database.
 * All offline data persistence goes through this module.
 *
 * Error recovery:
 * - Falls back to in-memory mock only when expo-sqlite is unavailable; an
 *   open failure on a native build reaches this module's recovery ladder
 * - On corruption (and only corruption), deletes the database and its WAL
 *   files and recreates it; other init errors retry without deleting
 * - If every attempt fails, runs on an in-memory SQLite database for the
 *   session (`isUsingInMemoryDatabase()` reports it)
 * - All queries are wrapped in try/catch at the caller level
 */

import { deleteAsync, documentDirectory } from "@/platform/fileSystem";
import {
  openDatabaseAsync,
  openInMemoryDatabaseAsync,
  isUsingMockDatabase,
  type SQLiteDatabase,
} from "@/platform/sqlite";

import { runDataMigrations } from "./migrations";
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
    await runDataMigrations(db);
    initAttempts = 0;
    return db;
  } catch (error) {
    initAttempts++;
    console.error(
      `[BugRout] Database init failed (attempt ${initAttempts}):`,
      error,
    );

    if (initAttempts < MAX_INIT_ATTEMPTS) {
      db = null;

      // Only a corrupt file is deleted. It holds the user's scenarios,
      // contacts, settings and downloaded-maps index, so a transient failure
      // (a lock, a full disk, a bad migration) retries without touching it.
      if (isCorruptionError(error)) {
        console.warn("[BugRout] Database is corrupt; recreating it.");
        await deleteDatabaseFiles();
      }

      return getDatabase();
    }

    // Give up on the file and run on an in-memory database for this session.
    // Opening a second named file here would hide the user's data, still in
    // bugrout.db, behind an empty database and send new writes elsewhere.
    console.warn("[BugRout] Using in-memory database after recovery failure.");
    db = await openInMemoryDatabaseAsync();
    await db.execAsync(CREATE_TABLES_SQL);
    return db;
  }
}

/**
 * Whether an error means the database file itself is unreadable, as opposed
 * to a failure the next attempt might not hit.
 *
 * @param error - The error from opening or initializing the database.
 * @returns `true` for SQLite's corrupt / not-a-database conditions.
 */
function isCorruptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /SQLITE_CORRUPT|SQLITE_NOTADB|malformed|not a database/i.test(message);
}

/**
 * Delete the database and its WAL sidecar files. Removing the main file alone
 * leaves `-wal`/`-shm` behind, and SQLite would replay them into the new one.
 */
async function deleteDatabaseFiles(): Promise<void> {
  const base = `${documentDirectory}SQLite/${DB_NAME}`;
  for (const path of [base, `${base}-wal`, `${base}-shm`]) {
    try {
      await deleteAsync(path, { idempotent: true });
    } catch {
      // Can't delete — the retry will surface it.
    }
  }
}

export type { SQLiteDatabase };
