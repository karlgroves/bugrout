/**
 * downloadRegion() writes a real tile file or fails — never a corrupt one.
 *
 * Two defects this pins:
 * - The HTTP status was never checked, so a 404 body was kept as the region's
 *   .pmtiles file and the region marked downloaded.
 * - "Resume" sent `Range: bytes=N-` for the bytes on disk, but the download
 *   overwrites rather than appends, leaving only the file's tail.
 */
import { downloadRegion } from "@/services/tiles/TileManager";

import type { Region } from "@bugrout/shared";

const mockCreateDownloadResumable = jest.fn();
const mockDeleteAsync = jest.fn(() => Promise.resolve());
const mockGetInfoAsync = jest.fn(() =>
  Promise.resolve({ exists: true, size: 5_000_000 }),
);

jest.mock("@/platform/fileSystem", () => ({
  documentDirectory: "file:///docs/",
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...(args as [])),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...(args as [])),
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
  pmtilesSize: 143_654_912,
  valhallaSize: 0,
  version: "2026.04.12",
  updatedAt: 0,
};

const PMTILES_PATH = "file:///docs/tiles/md/md.pmtiles";

function respondWith(status: number): void {
  mockCreateDownloadResumable.mockReturnValue({
    downloadAsync: () => Promise.resolve({ uri: PMTILES_PATH, status }),
  });
}

describe("downloadRegion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fails on an HTTP error and removes the file it wrote", async () => {
    respondWith(404);

    await expect(downloadRegion(MARYLAND)).rejects.toThrow("HTTP 404");
    expect(mockDeleteAsync).toHaveBeenLastCalledWith(PMTILES_PATH, {
      idempotent: true,
    });
  });

  it("never sends a Range header, even with a partial file on disk", async () => {
    respondWith(200);

    await downloadRegion(MARYLAND);

    const [url, dest, options] = mockCreateDownloadResumable.mock.calls[0] as [
      string,
      string,
      { headers?: Record<string, string> },
    ];
    expect(url).toMatch(/\/v1\/tiles\/md\/pmtiles$/);
    expect(dest).toBe(PMTILES_PATH);
    expect(options.headers?.Range).toBeUndefined();
    // The partial file is removed before the fresh download starts.
    expect(mockDeleteAsync).toHaveBeenCalledWith(PMTILES_PATH, {
      idempotent: true,
    });
  });
});
