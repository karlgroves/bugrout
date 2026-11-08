/**
 * The SQLite shim on a build that ships expo-sqlite (#299).
 *
 * An open failure from the real module must reach db/database.ts, whose
 * recovery ladder decides what to do. It used to be caught here, logged as
 * "expo-sqlite not available", and the user's database silently replaced by
 * an in-memory mock.
 */

const mockOpen = jest.fn();

// Called lazily, so `mockOpen` is initialised by the time it runs.
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: (name: string) => mockOpen(name) as unknown,
}));

import {
  isUsingInMemoryDatabase,
  isUsingMockDatabase,
  openDatabaseAsync,
  openInMemoryDatabaseAsync,
} from "@/platform/sqlite";

describe("sqlite shim with expo-sqlite present", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("propagates an open failure instead of falling back to the mock", async () => {
    mockOpen.mockRejectedValue(new Error("SQLITE_CANTOPEN: unable to open"));

    await expect(openDatabaseAsync("bugrout.db")).rejects.toThrow(
      "SQLITE_CANTOPEN",
    );
    expect(isUsingMockDatabase()).toBe(false);
    expect(isUsingInMemoryDatabase()).toBe(false);
  });

  it("opens the named database file", async () => {
    const db = { execAsync: jest.fn() };
    mockOpen.mockResolvedValue(db);

    await expect(openDatabaseAsync("bugrout.db")).resolves.toBe(db);
    expect(mockOpen).toHaveBeenCalledWith("bugrout.db");
  });

  it("opens the last-resort database in memory, not as a second file", async () => {
    const db = { execAsync: jest.fn() };
    mockOpen.mockResolvedValue(db);

    await expect(openInMemoryDatabaseAsync()).resolves.toBe(db);
    expect(mockOpen).toHaveBeenCalledWith(":memory:");
    expect(isUsingMockDatabase()).toBe(false);
    expect(isUsingInMemoryDatabase()).toBe(true);
  });
});
