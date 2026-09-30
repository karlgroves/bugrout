/**
 * downloadRegion() writes a real tile file or fails — never a corrupt one, and
 * never at the cost of the copy already on the device.
 *
 * Defects this pins:
 * - The HTTP status was never checked, so a 404 body was kept as the region's
 *   .pmtiles file and the region marked downloaded.
 * - "Resume" sent `Range: bytes=N-` for the bytes on disk, but the download
 *   overwrites rather than appends, leaving only the file's tail.
 * - An update deleted the existing file before downloading, so a failed update
 *   left the region with no map at all (#179). Downloads now land in a `.part`
 *   file that replaces the old one only on success.
 */
import { insertDownloadedRegion } from "@/db/queries/regions";
import { downloadRegion } from "@/services/tiles/TileManager";

import type { Region } from "@bugrout/shared";

const mockCreateDownloadResumable = jest.fn();
const mockDeleteAsync = jest.fn(
  (_path: string, _options?: { idempotent?: boolean }) => Promise.resolve(),
);
const mockMoveAsync = jest.fn((_options: { from: string; to: string }) =>
  Promise.resolve(),
);

jest.mock("@/platform/fileSystem", () => ({
  documentDirectory: "file:///docs/",
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: (path: string, options?: { idempotent?: boolean }) =>
    mockDeleteAsync(path, options),
  moveAsync: (options: { from: string; to: string }) => mockMoveAsync(options),
  createDownloadResumable: (...args: unknown[]) =>
    mockCreateDownloadResumable(...args) as unknown,
}));
jest.mock("@/db/queries/downloads", () => ({
  upsertDownloadProgress: jest.fn(() => Promise.resolve()),
  deleteDownloadProgress: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/db/queries/regions", () => ({
  insertDownloadedRegion: jest.fn(() => Promise.resolve()),
  deleteDownloadedRegion: jest.fn(() => Promise.resolve()),
  getDownloadedRegions: jest.fn(() => Promise.resolve([])),
}));
jest.mock("@/db/queries/resources", () => ({
  deleteResourcesByRegion: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/platform/analytics", () => ({
  track: jest.fn(),
  Events: { TILE_DOWNLOAD_COMPLETED: "tile_download_completed" },
}));

const MARYLAND: Region = {
  id: "md",
  name: "Maryland",
  bbox: { west: -79.49, south: 37.89, east: -75.05, north: 39.72 },
  pmtilesSize: 145_188_267,
  valhallaSize: 0,
  version: "2026.09.28",
  updatedAt: 0,
};

const PMTILES_PATH = "file:///docs/tiles/md/md.pmtiles";
const PART_PATH = `${PMTILES_PATH}.part`;

/** The downloaded file: resolves with `status`, or rejects with `error`. */
function respondWith(status: number | Error): void {
  mockCreateDownloadResumable.mockReturnValue({
    downloadAsync: () =>
      status instanceof Error
        ? Promise.reject(status)
        : Promise.resolve({ uri: PART_PATH, status }),
  });
}

/** Every path the download deleted. */
const deletedPaths = (): string[] =>
  mockDeleteAsync.mock.calls.map(([path]) => path);

describe("downloadRegion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("downloads into a .part file and moves it into place on success", async () => {
    respondWith(200);

    await downloadRegion(MARYLAND);

    const [url, dest, options] = mockCreateDownloadResumable.mock.calls[0] as [
      string,
      string,
      { headers?: Record<string, string> },
    ];
    expect(url).toMatch(/\/v1\/tiles\/md\/pmtiles$/);
    expect(dest).toBe(PART_PATH);
    expect(options.headers?.Range).toBeUndefined();
    expect(mockMoveAsync).toHaveBeenCalledWith({
      from: PART_PATH,
      to: PMTILES_PATH,
    });
    expect(deletedPaths()).not.toContain(PMTILES_PATH);
  });

  it("records the new version, so an update clears the stale state", async () => {
    respondWith(200);

    await downloadRegion(MARYLAND);

    expect(insertDownloadedRegion).toHaveBeenCalledWith(
      expect.objectContaining({ id: "md", version: "2026.09.28" }),
    );
  });

  it("leaves the existing map untouched when the server answers with an error", async () => {
    respondWith(404);

    await expect(downloadRegion(MARYLAND)).rejects.toThrow("HTTP 404");

    expect(deletedPaths()).toContain(PART_PATH);
    expect(deletedPaths()).not.toContain(PMTILES_PATH);
    expect(mockMoveAsync).not.toHaveBeenCalled();
    expect(insertDownloadedRegion).not.toHaveBeenCalled();
  });

  it("leaves the existing map untouched when the download itself fails", async () => {
    respondWith(new Error("The network connection was lost."));

    await expect(downloadRegion(MARYLAND)).rejects.toThrow(
      "network connection was lost",
    );

    expect(deletedPaths()).toContain(PART_PATH);
    expect(deletedPaths()).not.toContain(PMTILES_PATH);
    expect(mockMoveAsync).not.toHaveBeenCalled();
  });
});
