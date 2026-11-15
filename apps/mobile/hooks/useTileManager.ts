/**
 * Hook for managing offline tile downloads.
 */

import { useState, useCallback, useEffect } from "react";

import { DEFAULT_REGIONS } from "@/constants/regions";
import { cancelDownloadReminder } from "@/services/DownloadReminder";
import { loadCachedResources } from "@/services/resources/ResourceSync";
import * as TileManager from "@/services/tiles/TileManager";
import { useMapStore } from "@/stores/useMapStore";

import type { DownloadProgress } from "@/services/tiles/TileManager";
import type { Region, DownloadedRegion } from "@bugrout/shared";

/** Offline tile download state and actions returned by {@link useTileManager}. */
export interface UseTileManagerResult {
  downloadedRegions: DownloadedRegion[];
  availableRegions: Region[];
  activeDownload: DownloadProgress | null;
  storageUsed: number;
  storageAvailable: number;
  loading: boolean;
  downloadRegion: (region: Region) => Promise<void>;
  deleteRegion: (regionId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Manage offline tile downloads: list downloaded/available regions, track the
 * active download, report storage usage, and expose download/delete actions.
 */
export function useTileManager(): UseTileManagerResult {
  const [downloadedRegions, setDownloadedRegions] = useState<
    DownloadedRegion[]
  >([]);
  const [availableRegions, setAvailableRegions] = useState<Region[]>([]);
  const [activeDownload, setActiveDownload] = useState<DownloadProgress | null>(
    null,
  );
  const [storageUsed, setStorageUsed] = useState(0);
  const [storageAvailable, setStorageAvailable] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [regions, used, available] = await Promise.all([
        TileManager.getDownloadedRegions(),
        TileManager.getTotalStorageUsed(),
        TileManager.getAvailableStorage(),
      ]);
      setDownloadedRegions(regions);
      setStorageUsed(used);
      setStorageAvailable(available);
    } catch {
      // Silently fail — offline data may not be available yet
    }
    setLoading(false);
  }, []);

  const fetchAvailable = useCallback(async () => {
    try {
      const manifest = await TileManager.fetchManifest();
      setAvailableRegions(manifest.length > 0 ? manifest : DEFAULT_REGIONS);
    } catch {
      // Offline — use default region list as fallback
      setAvailableRegions(DEFAULT_REGIONS);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void fetchAvailable();
  }, [refresh, fetchAvailable]);

  const downloadRegion = useCallback(
    async (region: Region) => {
      try {
        const { region: entry, manifest } = await publishedEntryFor(region);
        if (manifest) setAvailableRegions(manifest);
        const downloaded = await TileManager.downloadRegion(
          entry,
          setActiveDownload,
        );
        setActiveDownload(null);
        await syncActiveRegion(downloaded);
        await refresh();
      } catch (error) {
        setActiveDownload(null);
        throw error;
      }
    },
    [refresh],
  );

  const deleteRegion = useCallback(
    async (regionId: string) => {
      await TileManager.deleteRegion(regionId);
      await refresh();
    },
    [refresh],
  );

  return {
    downloadedRegions,
    availableRegions,
    activeDownload,
    storageUsed,
    storageAvailable,
    loading,
    downloadRegion,
    deleteRegion,
    refresh,
  };
}

/**
 * The manifest's entry for `region`, before any of it is downloaded (#292).
 *
 * When the manifest couldn't be loaded, the list on screen is `DEFAULT_REGIONS`,
 * whose sizes are hand estimates. A download must match the published size
 * exactly, so starting one from an estimate would always fail, and only after
 * the whole file had downloaded. Instead the manifest is fetched again and its
 * entry used, along with the fresh list.
 *
 * @throws When the manifest still can't be fetched, or doesn't publish the
 *   region; nothing has been downloaded.
 */
async function publishedEntryFor(
  region: Region,
): Promise<{ region: Region; manifest?: Region[] }> {
  if (!DEFAULT_REGIONS.includes(region)) return { region };
  let manifest: Region[];
  try {
    manifest = await TileManager.fetchManifest();
  } catch {
    throw new Error(
      "The list of offline maps couldn't be loaded. Check your connection and try again.",
    );
  }
  const entry = manifest.find((r) => r.id === region.id);
  if (!entry) {
    throw new Error(`The offline map for ${region.name} isn't published yet.`);
  }
  return { region: entry, manifest };
}

/**
 * Point the map at a freshly downloaded region when it is the one on screen,
 * or when no region is on screen yet.
 *
 * An update replaces the region the map is showing; without this, the map's
 * stale banner keeps judging the old record's version. A first download used
 * to change nothing on the map until the app restarted, because only
 * AppBootstrap set the active region and `tilesLoaded` (#199).
 *
 * @param downloaded - The region record just written.
 */
async function syncActiveRegion(downloaded: DownloadedRegion): Promise<void> {
  const mapStore = useMapStore.getState();
  const current = mapStore.activeRegion;
  if (current === null || current.id === downloaded.id) {
    mapStore.setActiveRegion(downloaded);
    mapStore.setTilesLoaded(true);
    // The download may have loaded resources (packaged fuel, #200). The map
    // shows the store, and the sync a new region triggers is rate-limited,
    // so load them now. Best effort: the download itself succeeded, and the
    // next sync loads them anyway.
    try {
      await loadCachedResources(downloaded.id);
    } catch {
      // Not a failed download; nothing to undo.
    }
  }
  // A region is on the device now; the reminder to get one is moot.
  void cancelDownloadReminder();
}
