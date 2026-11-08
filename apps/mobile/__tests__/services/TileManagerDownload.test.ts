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
 *
 * And for the packaged fuel stations (#200): a file is loaded only once it
 * matches the manifest's SHA-256, and a fuel problem never costs the map.
 *
 * And for the map and routing archives (#292): each must be the size the
 * manifest gives before it replaces anything, and a package whose routing
 * archive fails is recorded as incomplete, not as current with a path to a
 * file that does not exist.
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

import { insertDownloadedRegion } from "@/db/queries/regions";
import { downloadRegion } from "@/services/tiles/TileManager";
import { INCOMPLETE_VERSION } from "@/services/tiles/TileVersions";

import type { Region } from "@bugrout/shared";

const mockCreateDownloadResumable = jest.fn();
const mockDeleteAsync = jest.fn(
  (_path: string, _options?: { idempotent?: boolean }) => Promise.resolve(),
);
const mockMoveAsync = jest.fn((_options: { from: string; to: string }) =>
  Promise.resolve(),
);

/** Size each downloaded `.part` file reports, by path; absent means unknown. */
const mockPartSizes = new Map<string, number>();

const mockReadAsStringAsync = jest.fn((_path: string) => Promise.resolve(""));
const mockLoadPackagedFuelStations = jest.fn(
  (_text: string, _regionId: string, _builtAt: number) => Promise.resolve(3),
);

jest.mock("@/platform/fileSystem", () => ({
  documentDirectory: "file:///docs/",
  readAsStringAsync: (path: string) => mockReadAsStringAsync(path),
  getInfoAsync: (path: string) =>
    Promise.resolve({ exists: true, size: mockPartSizes.get(path) }),
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
jest.mock("@/services/resources/FuelService", () => ({
  loadPackagedFuelStations: (text: string, regionId: string, builtAt: number) =>
    mockLoadPackagedFuelStations(text, regionId, builtAt),
}));
jest.mock("@/platform/crypto", () => ({
  sha256Hex: (text: string) =>
    Promise.resolve(
      jest
        .requireActual<{ createHash: typeof createHash }>("crypto")
        .createHash("sha256")
        .update(text)
        .digest("hex"),
    ),
}));
const mockCaptureError = jest.fn(
  (_error: Error, _context?: Record<string, unknown>) => undefined,
);
jest.mock("@/services/CrashReporting", () => ({
  captureError: (error: Error, context?: Record<string, unknown>) => {
    mockCaptureError(error, context);
  },
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
const VALHALLA_PATH = "file:///docs/tiles/md/md.valhalla.tar.gz";
const VALHALLA_PART_PATH = `${VALHALLA_PATH}.part`;

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
    mockPartSizes.clear();
    mockPartSizes.set(PART_PATH, MARYLAND.pmtilesSize);
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

  describe("packaged fuel stations (#200)", () => {
    /** The pipeline's real output, as the tile server would serve it. */
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- this test's own fixture, at a path built from __dirname
    const FUEL = readFileSync(
      join(__dirname, "../fixtures/fuel-package.json"),
      "utf8",
    );
    const WITH_FUEL: Region = {
      ...MARYLAND,
      updatedAt: 1_790_731_024_103,
      fuelSize: Buffer.byteLength(FUEL),
      fuelSha256: createHash("sha256").update(FUEL).digest("hex"),
    };
    const FUEL_PATH = "file:///docs/tiles/md/md.fuel.json";

    /** Every URL the download requested. */
    const requestedUrls = (): string[] =>
      mockCreateDownloadResumable.mock.calls.map(([url]) => url as string);

    beforeEach(() => {
      mockReadAsStringAsync.mockResolvedValue(FUEL);
    });

    it("downloads, verifies and loads them with the map", async () => {
      respondWith(200);

      await downloadRegion(WITH_FUEL);

      expect(requestedUrls().at(-1)).toMatch(/\/v1\/tiles\/md\/fuel$/);
      expect(mockReadAsStringAsync).toHaveBeenCalledWith(FUEL_PATH);
      expect(mockLoadPackagedFuelStations).toHaveBeenCalledWith(
        FUEL,
        "md",
        WITH_FUEL.updatedAt,
      );
      expect(mockCaptureError).not.toHaveBeenCalled();
      expect(insertDownloadedRegion).toHaveBeenCalledWith(
        expect.objectContaining({
          sizeBytes: MARYLAND.pmtilesSize + Buffer.byteLength(FUEL),
        }),
      );
    });

    it("discards a file that doesn't match the manifest, keeping the map", async () => {
      respondWith(200);
      mockReadAsStringAsync.mockResolvedValue(FUEL.replace("Shell", "Shelk"));

      await downloadRegion(WITH_FUEL);

      expect(mockLoadPackagedFuelStations).not.toHaveBeenCalled();
      expect(deletedPaths()).toContain(FUEL_PATH);
      expect(insertDownloadedRegion).toHaveBeenCalled();
      // A bad package must be seen, not just survived.
      expect(mockCaptureError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("verification") as unknown,
        }),
        { regionId: "md", stage: "packaged-fuel" },
      );
    });

    it("keeps the map when the fuel download fails", async () => {
      mockCreateDownloadResumable.mockImplementation((url: string) => ({
        downloadAsync: () =>
          Promise.resolve({
            uri: "",
            status: url.endsWith("/fuel") ? 404 : 200,
          }),
      }));

      await downloadRegion(WITH_FUEL);

      expect(mockLoadPackagedFuelStations).not.toHaveBeenCalled();
      expect(insertDownloadedRegion).toHaveBeenCalled();
    });

    it("asks for none from a package built before fuel was packaged", async () => {
      respondWith(200);

      await downloadRegion(MARYLAND);

      expect(requestedUrls().some((u) => u.endsWith("/fuel"))).toBe(false);
      expect(mockLoadPackagedFuelStations).not.toHaveBeenCalled();
    });
  });
  describe("map and routing archive sizes (#292)", () => {
    const WITH_ROUTING: Region = { ...MARYLAND, valhallaSize: 52_000_000 };

    it("discards a map file that isn't the manifest's size, keeping the old one", async () => {
      respondWith(200);
      mockPartSizes.set(PART_PATH, MARYLAND.pmtilesSize - 1);

      await expect(downloadRegion(MARYLAND)).rejects.toThrow(
        `expected ${String(MARYLAND.pmtilesSize)}`,
      );

      expect(deletedPaths()).toContain(PART_PATH);
      expect(deletedPaths()).not.toContain(PMTILES_PATH);
      expect(mockMoveAsync).not.toHaveBeenCalled();
      expect(insertDownloadedRegion).not.toHaveBeenCalled();
    });

    it("fails closed when the downloaded file's size can't be read", async () => {
      respondWith(200);
      mockPartSizes.delete(PART_PATH);

      await expect(downloadRegion(MARYLAND)).rejects.toThrow("of unknown size");

      expect(mockMoveAsync).not.toHaveBeenCalled();
      expect(insertDownloadedRegion).not.toHaveBeenCalled();
    });

    it("records the routing archive when it downloads at the right size", async () => {
      respondWith(200);
      mockPartSizes.set(VALHALLA_PART_PATH, WITH_ROUTING.valhallaSize);

      await downloadRegion(WITH_ROUTING);

      expect(mockMoveAsync).toHaveBeenCalledWith({
        from: VALHALLA_PART_PATH,
        to: VALHALLA_PATH,
      });
      expect(insertDownloadedRegion).toHaveBeenCalledWith(
        expect.objectContaining({
          valhallaTilesPath: VALHALLA_PATH,
          version: "2026.09.28",
        }),
      );
      expect(mockCaptureError).not.toHaveBeenCalled();
    });

    it.each([
      ["fails to download", 404, WITH_ROUTING.valhallaSize],
      ["is the wrong size", 200, WITH_ROUTING.valhallaSize - 4096],
    ])(
      "records the map as incomplete when the routing archive %s",
      async (_case, status, size) => {
        mockCreateDownloadResumable.mockImplementation((url: string) => ({
          downloadAsync: () =>
            Promise.resolve({
              uri: "",
              status: url.endsWith("/valhalla") ? status : 200,
            }),
        }));
        mockPartSizes.set(VALHALLA_PART_PATH, size);

        await downloadRegion(WITH_ROUTING);

        expect(mockMoveAsync).not.toHaveBeenCalledWith(
          expect.objectContaining({ to: VALHALLA_PATH }),
        );
        // The map is kept, but the region is not passed off as current with
        // a routing path to a file that isn't there.
        expect(insertDownloadedRegion).toHaveBeenCalledWith(
          expect.objectContaining({
            pmtilesPath: PMTILES_PATH,
            valhallaTilesPath: "",
            version: INCOMPLETE_VERSION,
          }),
        );
        expect(mockCaptureError).toHaveBeenCalledWith(expect.any(Error), {
          regionId: "md",
          stage: "routing-tiles",
        });
      },
    );

    it("records no routing path for a package that has none", async () => {
      respondWith(200);

      await downloadRegion(MARYLAND);

      expect(insertDownloadedRegion).toHaveBeenCalledWith(
        expect.objectContaining({
          valhallaTilesPath: "",
          version: "2026.09.28",
        }),
      );
    });
  });
});
