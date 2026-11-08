/**
 * SQLite platform abstraction.
 *
 * On a native build this is expo-sqlite, and its errors propagate: a database
 * that cannot be opened (corrupt, locked, full disk) reaches
 * `db/database.ts`, whose recovery ladder decides what to do. Only where the
 * module is genuinely unavailable — web, or Expo Go without the native module
 * — does it fall back to an in-memory mock.
 *
 * The module used to be required inside the open call's `try`, so any open
 * failure on a real device silently swapped the user's database for RAM and
 * logged that expo-sqlite was missing (#299).
 */

import { Platform } from "react-native";

const SQLITE_MODULE = "expo-sqlite";

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

/** The subset of expo-sqlite this wrapper uses. */
interface ExpoSQLite {
  openDatabaseAsync(name: string): Promise<SQLiteDatabase>;
}

/**
 * Load the native SQLite module.
 *
 * @returns The module, or `null` on web (where expo-sqlite's WASM bundling
 *   breaks Metro) or when it is not in this binary.
 */
function loadSQLite(): ExpoSQLite | null {
  if (Platform.OS === "web") return null;
  try {
    // Dynamic require with variable to prevent Metro static analysis
    const mod = SQLITE_MODULE;
    return require(mod) as ExpoSQLite;
  } catch {
    return null;
  }
}

const nativeSQLite = loadSQLite();

let usingMock = false;
let inMemory = false;

/**
 * Reports whether the JS mock database is in use (web / Expo Go) rather than
 * a real expo-sqlite database.
 */
export function isUsingMockDatabase(): boolean {
  return usingMock;
}

/**
 * Reports whether the open database lives only in memory — the mock, or the
 * last-resort in-memory SQLite database — so nothing written survives the
 * process.
 */
export function isUsingInMemoryDatabase(): boolean {
  return usingMock || inMemory;
}

/**
 * Opens (or creates) a SQLite database. Falls back to the in-memory mock only
 * where expo-sqlite is unavailable; an open failure from the real module
 * propagates.
 */
export async function openDatabaseAsync(name: string): Promise<SQLiteDatabase> {
  if (!nativeSQLite) {
    console.warn(
      "[BugRout] expo-sqlite not available (web / Expo Go). Using in-memory mock database.",
    );
    usingMock = true;
    return createMockDatabase();
  }
  return nativeSQLite.openDatabaseAsync(name);
}

/**
 * Opens a real SQLite database that lives only in memory (`:memory:`), for
 * the last-resort branch when the database file cannot be opened at all.
 * Unlike a second named file, it never hides the user's data on disk behind
 * a fresh empty file.
 */
export async function openInMemoryDatabaseAsync(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(":memory:");
  inMemory = true;
  return db;
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
    ? rows.findIndex((r) => (r as Record<string, unknown>)[pkCol] === params[0])
    : -1;
  if (idx >= 0) {
    rows[idx] = row;
  } else {
    rows.push(row);
  }

  return { changes: 1 };
}

/** One term of a WHERE clause the mock can evaluate. */
interface MockTerm {
  column: string;
  /** `=`, `<`, `<=`, `>`, `>=`, `BETWEEN`, `IS NULL` or `IS NOT NULL`. */
  op: string;
  /** Index of the term's first `?` parameter. */
  offset: number;
  /** How many `?` parameters the term binds. */
  arity: number;
}

/** A WHERE clause the mock can evaluate: terms joined by AND. */
interface MockWhere {
  terms: MockTerm[];
  /** The total number of `?` parameters the clause binds. */
  arity: number;
}

/**
 * One term the mock understands, followed by `AND <another term>` or the end
 * of the clause: `col = ?` (or `<`, `<=`, `>`, `>=`), `col IS [NOT] NULL`, or
 * `col BETWEEN ? AND ?`.
 */
const MOCK_TERM =
  /^(\w+)\s*(?:(<=|>=|=|<|>)\s*\?|IS\s+(NOT\s)?\s*NULL|(BETWEEN)\s+\?\s+AND\s+\?)\s*(?:\bAND\s+(?=\S)|$)/i;

/** Builds the term `match` (a {@link MOCK_TERM} match) describes. */
function mockTerm(match: RegExpExecArray, offset: number): MockTerm {
  const [, column = "", cmp, not, between] = match;
  if (cmp) return { column, op: cmp, offset, arity: 1 };
  if (between) return { column, op: "BETWEEN", offset, arity: 2 };
  return { column, op: not ? "IS NOT NULL" : "IS NULL", offset, arity: 0 };
}

/**
 * Parses the WHERE clause of `sql`, if any.
 *
 * Only AND-joined terms of the shapes in {@link MOCK_TERM} are understood —
 * the ones the app's queries use. Anything else (OR, LIKE, IN, functions)
 * throws rather than being guessed at: a guess used to turn `expires_at < ?`
 * into "delete every row" and report `changes: 0` (#299).
 *
 * @returns The clause's terms, or `null` if there is no WHERE clause.
 */
function parseMockWhere(sql: string): MockWhere | null {
  const match = /\bWHERE\b([\s\S]*?)(?:\bORDER\s+BY\b|\bLIMIT\b|$)/i.exec(sql);
  if (!match) return null;
  let rest = (match[1] ?? "").trim();
  const terms: MockTerm[] = [];
  let arity = 0;
  do {
    const term = MOCK_TERM.exec(rest);
    if (!term) {
      throw new Error(`[BugRout] Mock database cannot evaluate WHERE: ${sql}`);
    }
    const parsed = mockTerm(term, arity);
    terms.push(parsed);
    arity += parsed.arity;
    rest = rest.slice(term[0].length);
  } while (rest);
  return { terms, arity };
}

/** A value the mock compares: what a row or a parameter holds. */
type MockValue = number | string;

/**
 * How each binary operator compares a row value with its parameters (`b` is
 * the second parameter, used only by BETWEEN).
 */
const MOCK_COMPARE: Record<
  string,
  (value: MockValue, a: MockValue, b: MockValue) => boolean
> = {
  "=": (v, a) => v === a,
  "<": (v, a) => v < a,
  "<=": (v, a) => v <= a,
  ">": (v, a) => v > a,
  ">=": (v, a) => v >= a,
  BETWEEN: (v, a, b) => v >= a && v <= b,
};

/**
 * Whether `value` satisfies `term`. As in SQL, a NULL on either side of a
 * comparison is never a match; only `IS [NOT] NULL` tests for it.
 */
function mockTermMatches(
  value: unknown,
  term: MockTerm,
  params: unknown[],
): boolean {
  if (term.op === "IS NULL") return value == null;
  if (term.op === "IS NOT NULL") return value != null;
  const args = params.slice(term.offset, term.offset + term.arity);
  if (value == null || args.some((a) => a == null)) return false;
  const compare = MOCK_COMPARE[term.op];
  const first = args[0] as MockValue;
  const second = (args[1] ?? args[0]) as MockValue;
  return compare ? compare(value as MockValue, first, second) : false;
}

/** Whether `row` satisfies every term of `where`. */
function mockMatches(
  row: unknown,
  where: MockWhere | null,
  params: unknown[],
): boolean {
  if (!where) return true;
  return where.terms.every((term) =>
    mockTermMatches(
      (row as Record<string, unknown>)[term.column],
      term,
      params,
    ),
  );
}

/**
 * Handles a mock DELETE statement, returning the true affected-row count, or
 * null if the SQL is not a delete.
 */
function mockDelete(
  tables: MockTables,
  sql: string,
  params: unknown[],
): { changes: number } | null {
  const deleteMatch = /DELETE FROM (\w+)/i.exec(sql);
  const table = deleteMatch?.[1];
  if (!table) return null;

  const where = parseMockWhere(sql);
  const existingRows = tables.get(table);
  if (!existingRows) return { changes: 0 };

  const kept = existingRows.filter((r) => !mockMatches(r, where, params));
  tables.set(table, kept);
  return { changes: existingRows.length - kept.length };
}

/** Sorts `rows` by a single-column `ORDER BY col [ASC|DESC]`, if present. */
function mockOrder<T>(rows: T[], sql: string): T[] {
  const order = /ORDER BY (\w+)( ASC| DESC)?/i.exec(sql);
  const orderCol = order?.[1];
  if (!orderCol) return rows;
  const dir = order[2]?.trim().toUpperCase() === "DESC" ? -1 : 1;
  const key = (r: T): number | string =>
    (r as Record<string, number | string>)[orderCol] ?? "";
  return [...rows].sort((x, y) => {
    const a = key(x);
    const b = key(y);
    if (a === b) return 0;
    return a < b ? -dir : dir;
  });
}

/**
 * Applies `LIMIT n` or `LIMIT ?`, if present. A `?` limit is the parameter
 * after the WHERE clause's.
 */
function mockLimit<T>(
  rows: T[],
  sql: string,
  params: unknown[],
  whereParams: number,
): T[] {
  const limit = /LIMIT (\d+|\?)/i.exec(sql)?.[1];
  if (!limit) return rows;
  const n = limit === "?" ? Number(params[whereParams]) : Number(limit);
  return rows.slice(0, n);
}

/**
 * Handles a mock SELECT statement: AND-joined WHERE terms, a single-column
 * ORDER BY, then LIMIT (a literal or a `?` parameter).
 */
function mockSelect<T>(
  tables: MockTables,
  sql: string,
  params: unknown[],
): T[] {
  const match = /FROM (\w+)/i.exec(sql);
  const table = match?.[1];
  if (!table) return [];

  const where = parseMockWhere(sql);
  const rows = (tables.get(table) ?? []).filter((r) =>
    mockMatches(r, where, params),
  ) as T[];

  return mockLimit(mockOrder(rows, sql), sql, params, where?.arity ?? 0);
}

/** Normalises a thrown value so a rejection always carries an Error. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * In-memory mock database for Expo Go preview.
 * Stores data in Maps keyed by table name.
 * Supports basic INSERT/SELECT/DELETE — enough for UI preview — and throws on
 * a WHERE clause it cannot evaluate instead of guessing.
 */
function createMockDatabase(): SQLiteDatabase {
  const tables: MockTables = new Map<string, unknown[]>();

  return {
    execAsync(sql: string): Promise<void> {
      mockCreateTables(tables, sql);
      return Promise.resolve();
    },

    runAsync(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
      try {
        const result =
          mockInsert(tables, sql, params) ?? mockDelete(tables, sql, params);
        return Promise.resolve(result ?? { changes: 0 });
      } catch (error) {
        return Promise.reject(asError(error));
      }
    },

    getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      try {
        return Promise.resolve(mockSelect<T>(tables, sql, params));
      } catch (error) {
        return Promise.reject(asError(error));
      }
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
