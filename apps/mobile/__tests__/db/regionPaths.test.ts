/**
 * Downloaded-region file paths survive a change of data container (#185).
 *
 * iOS moves an app's data container on reinstall and can on update. Regions
 * stored their absolute download path, so after the move the database pointed
 * at the old container and MapLibre reported "Error fetching PMTiles header:
 * path not found": the offline map went blank until the region was deleted and
 * downloaded again. Paths are now stored relative to the documents directory
 * and resolved against the current one on read.
 */

import {
  getDownloadedRegion,
  insertDownloadedRegion,
  resolveStoredPath,
  toStoredPath,
} from "@/db/queries/regions";

import type { DownloadedRegion } from "@bugrout/shared";

const DOCS =
  "file:///Users/me/Library/Developer/CoreSimulator/Devices/D/data/Containers/Data/Application/9CC8975B/Documents/";
const OLD_DOCS =
  "file:///Users/me/Library/Developer/CoreSimulator/Devices/D/data/Containers/Data/Application/E5239FF1/Documents/";

jest.mock("@/platform/fileSystem", () => ({
  documentDirectory:
    "file:///Users/me/Library/Developer/CoreSimulator/Devices/D/data/Containers/Data/Application/9CC8975B/Documents/",
}));

// A one-row stand-in for the downloaded_regions table: it records what was
// written and returns whatever row the test puts in it.
let mockRow: Record<string, unknown> | null = null;
const mockRunAsync = jest.fn((_sql: string, ...params: unknown[]) => {
  const [id, name, bbox, pmtiles, valhalla, downloadedAt, size, version] =
    params;
  mockRow = {
    id,
    name,
    bbox,
    pmtiles_path: pmtiles,
    valhalla_tiles_path: valhalla,
    downloaded_at: downloadedAt,
    size_bytes: size,
    version,
  };
  return Promise.resolve({ changes: 1 });
});

jest.mock("@/db/database", () => ({
  getDatabase: () =>
    Promise.resolve({
      runAsync: mockRunAsync,
      getFirstAsync: () => Promise.resolve(mockRow),
    }),
}));

const region: DownloadedRegion = {
  id: "md",
  name: "Maryland",
  bbox: { west: -79.5, south: 37.9, east: -75.0, north: 39.7 },
  pmtilesPath: `${DOCS}tiles/md/md.pmtiles`,
  valhallaTilesPath: `${DOCS}tiles/md/md.valhalla.tar.gz`,
  downloadedAt: 1,
  sizeBytes: 145_188_267,
  version: "2026.09.28",
};

beforeEach(() => {
  mockRow = null;
  mockRunAsync.mockClear();
});

describe("storing a region", () => {
  it("writes paths relative to the documents directory", async () => {
    await insertDownloadedRegion(region);

    expect(mockRow).toMatchObject({
      pmtiles_path: "tiles/md/md.pmtiles",
      valhalla_tiles_path: "tiles/md/md.valhalla.tar.gz",
    });
  });

  it("reads them back as absolute paths in the current container", async () => {
    await insertDownloadedRegion(region);

    const read = await getDownloadedRegion("md");
    expect(read?.pmtilesPath).toBe(`${DOCS}tiles/md/md.pmtiles`);
    expect(read?.valhallaTilesPath).toBe(`${DOCS}tiles/md/md.valhalla.tar.gz`);
  });
});

describe("a region stored by an earlier build", () => {
  it("resolves into the current container after the container moved", async () => {
    // Exactly what #185 observed: the row still held the E5239FF1 path.
    mockRow = {
      id: "md",
      name: "Maryland",
      bbox: JSON.stringify(region.bbox),
      pmtiles_path: `${OLD_DOCS}tiles/md/md.pmtiles`,
      valhalla_tiles_path: `${OLD_DOCS}tiles/md/md.valhalla.tar.gz`,
      downloaded_at: 1,
      size_bytes: 1,
      version: "2026.04.12",
    };

    const read = await getDownloadedRegion("md");
    expect(read?.pmtilesPath).toBe(`${DOCS}tiles/md/md.pmtiles`);
    expect(read?.valhallaTilesPath).toBe(`${DOCS}tiles/md/md.valhalla.tar.gz`);
  });
});

describe("resolveStoredPath", () => {
  it.each([
    ["a relative path", "tiles/md/md.pmtiles", `${DOCS}tiles/md/md.pmtiles`],
    [
      "an absolute path in an old container",
      `${OLD_DOCS}tiles/de/de.pmtiles`,
      `${DOCS}tiles/de/de.pmtiles`,
    ],
    [
      "an absolute path in the current container",
      `${DOCS}tiles/md/md.pmtiles`,
      `${DOCS}tiles/md/md.pmtiles`,
    ],
    [
      "an Android files-dir path",
      "file:///data/user/0/com.bugrout.app/files/tiles/md/md.pmtiles",
      `${DOCS}tiles/md/md.pmtiles`,
    ],
    ["an empty value", "", ""],
    [
      "a path that isn't a region file",
      "file:///elsewhere/x.pmtiles",
      "file:///elsewhere/x.pmtiles",
    ],
  ])("handles %s", (_label, stored, expected) => {
    expect(resolveStoredPath(stored)).toBe(expected);
  });
});

describe("toStoredPath", () => {
  it("leaves a path outside the documents directory unchanged", () => {
    expect(toStoredPath("file:///elsewhere/x.pmtiles")).toBe(
      "file:///elsewhere/x.pmtiles",
    );
  });
});
