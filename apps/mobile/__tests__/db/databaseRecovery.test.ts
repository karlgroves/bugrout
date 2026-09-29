/**
 * Database init recovery must never delete user data on a transient error.
 *
 * The recovery path deletes bugrout.db — scenarios, contacts, settings and the
 * downloaded-maps index. It was dormant while `documentDirectory` was a mock
 * path; with the real path it is live, so what triggers it matters.
 */

import type * as DatabaseNamespace from "@/db/database";

type DatabaseModule = typeof DatabaseNamespace;

const DOCS = "file:///docs/";
const mockDeleteAsync = jest.fn(
  (_path: string, _options?: { idempotent?: boolean }) => Promise.resolve(),
);
const mockOpenDatabaseAsync = jest.fn();

jest.mock("@/platform/fileSystem", () => ({
  documentDirectory: "file:///docs/",
  deleteAsync: (path: string, options?: { idempotent?: boolean }) =>
    mockDeleteAsync(path, options),
}));
jest.mock("@/platform/sqlite", () => ({
  openDatabaseAsync: (...args: unknown[]) =>
    mockOpenDatabaseAsync(...args) as unknown,
  isUsingMockDatabase: () => false,
}));

/** A database whose first `execAsync` call rejects with `error`, then works. */
function failingOnce(error: Error) {
  let failed = false;
  return {
    execAsync: jest.fn(() => {
      if (!failed) {
        failed = true;
        return Promise.reject(error);
      }
      return Promise.resolve();
    }),
  };
}

/** Load db/database fresh, so its module-level state resets per test. */
function loadDatabase(): DatabaseModule {
  let mod: DatabaseModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a require for fresh module state
    mod = require("@/db/database") as DatabaseModule;
  });
  if (!mod) throw new Error("failed to load @/db/database");
  return mod;
}

describe("getDatabase recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("retries a transient failure without deleting the database", async () => {
    const database = failingOnce(new Error("database is locked"));
    mockOpenDatabaseAsync.mockResolvedValue(database);

    await expect(loadDatabase().getDatabase()).resolves.toBe(database);

    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it("deletes the database and its WAL files when the file is corrupt", async () => {
    const database = failingOnce(
      new Error("SQLITE_CORRUPT: database disk image is malformed"),
    );
    mockOpenDatabaseAsync.mockResolvedValue(database);

    await expect(loadDatabase().getDatabase()).resolves.toBe(database);

    const deleted = mockDeleteAsync.mock.calls.map(([path]) => path);
    expect(deleted).toEqual([
      `${DOCS}SQLite/bugrout.db`,
      `${DOCS}SQLite/bugrout.db-wal`,
      `${DOCS}SQLite/bugrout.db-shm`,
    ]);
  });
});
