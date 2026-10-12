/**
 * Updating the region the map is showing must clear its stale banner (#179).
 *
 * The map screen judges staleness from `useMapStore().activeRegion`. If an
 * update only rewrote the database, the store would keep the old record and
 * its old version, and the banner would stay up until the next launch.
 */
import { act, renderHook } from "@testing-library/react-native";

import { useTileManager } from "@/hooks/useTileManager";
import { useMapStore } from "@/stores/useMapStore";

import type { DownloadedRegion, Region } from "@bugrout/shared";

const OLD: DownloadedRegion = {
  id: "md",
  name: "Maryland",
  bbox: { west: -79.49, south: 37.89, east: -75.05, north: 39.72 },
  pmtilesPath: "file:///docs/tiles/md/md.pmtiles",
  valhallaTilesPath: "file:///docs/tiles/md/md.valhalla.tar.gz",
  downloadedAt: 0,
  sizeBytes: 143_142_244,
  version: "2026.04.12",
};
const PUBLISHED: Region = {
  id: "md",
  name: "Maryland",
  bbox: OLD.bbox,
  pmtilesSize: 145_188_267,
  valhallaSize: 0,
  version: "2026.09.28",
  updatedAt: 0,
};
const mockUpdated: DownloadedRegion = {
  ...OLD,
  downloadedAt: 1,
  sizeBytes: 145_188_267,
  version: "2026.09.28",
};

const mockCancelReminder = jest.fn(() => Promise.resolve());
jest.mock("@/services/DownloadReminder", () => ({
  cancelDownloadReminder: () => mockCancelReminder(),
}));

const mockLoadCachedResources = jest.fn((_regionId: string) =>
  Promise.resolve(),
);
jest.mock("@/services/resources/ResourceSync", () => ({
  loadCachedResources: (regionId: string) => mockLoadCachedResources(regionId),
}));

jest.mock("@/services/tiles/TileManager", () => ({
  fetchManifest: jest.fn(() => Promise.resolve([])),
  getDownloadedRegions: jest.fn(() => Promise.resolve([])),
  getTotalStorageUsed: jest.fn(() => Promise.resolve(0)),
  getAvailableStorage: jest.fn(() => Promise.resolve(0)),
  deleteRegion: jest.fn(() => Promise.resolve()),
  downloadRegion: jest.fn(() => Promise.resolve(mockUpdated)),
}));

describe("useTileManager.downloadRegion", () => {
  beforeEach(() => {
    useMapStore.setState({ activeRegion: null, tilesLoaded: false });
    mockCancelReminder.mockClear();
    mockLoadCachedResources.mockClear();
  });

  it("points the map at the updated region when it is the one on screen", async () => {
    useMapStore.setState({ activeRegion: OLD });
    const { result } = await renderHook(() => useTileManager());

    await act(async () => {
      await result.current.downloadRegion(PUBLISHED);
    });

    expect(useMapStore.getState().activeRegion?.version).toBe("2026.09.28");
  });

  // #200: the download may have loaded packaged fuel stations. The sync a new
  // region triggers is rate-limited, so without this an update kept showing
  // the old stations for up to five minutes.
  it("shows the resources the download loaded, for the region on screen", async () => {
    useMapStore.setState({ activeRegion: OLD });
    const { result } = await renderHook(() => useTileManager());

    await act(async () => {
      await result.current.downloadRegion(PUBLISHED);
    });

    expect(mockLoadCachedResources).toHaveBeenCalledWith("md");
  });

  it("doesn't report a finished download as failed when that reload fails", async () => {
    mockLoadCachedResources.mockRejectedValueOnce(new Error("database locked"));
    useMapStore.setState({ activeRegion: OLD });
    const { result } = await renderHook(() => useTileManager());

    await act(async () => {
      await expect(
        result.current.downloadRegion(PUBLISHED),
      ).resolves.toBeUndefined();
    });

    expect(useMapStore.getState().activeRegion?.version).toBe("2026.09.28");
  });

  it("leaves the map alone when a different region was downloaded", async () => {
    const other: DownloadedRegion = { ...OLD, id: "va", name: "Virginia" };
    useMapStore.setState({ activeRegion: other });
    const { result } = await renderHook(() => useTileManager());

    await act(async () => {
      await result.current.downloadRegion(PUBLISHED);
    });

    expect(useMapStore.getState().activeRegion).toBe(other);
    expect(mockLoadCachedResources).not.toHaveBeenCalled();
  });

  // #199: a first download used to change nothing on the map until the app
  // restarted, because only AppBootstrap set the active region.
  it("shows a first download on the map straight away", async () => {
    const { result } = await renderHook(() => useTileManager());

    await act(async () => {
      await result.current.downloadRegion(PUBLISHED);
    });

    expect(useMapStore.getState().activeRegion?.id).toBe("md");
    expect(useMapStore.getState().tilesLoaded).toBe(true);
  });

  it("cancels the reminder to download once a region is on the device", async () => {
    const { result } = await renderHook(() => useTileManager());

    await act(async () => {
      await result.current.downloadRegion(PUBLISHED);
    });

    expect(mockCancelReminder).toHaveBeenCalled();
  });
});
