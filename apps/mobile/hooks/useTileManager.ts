/**
 * Hook for managing offline tile downloads.
 */

import { useState, useCallback, useEffect } from "react";

import { DEFAULT_REGIONS } from "@/constants/regions";
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
        const downloaded = await TileManager.downloadRegion(
          region,
          (progress) => {
            setActiveDownload(progress);
          },
        );
        setActiveDownload(null);
        syncActiveRegion(downloaded);
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
 * Point the map at a freshly downloaded region when it is the one on screen.
 * An update replaces the region the map is showing; without this, the map's
 * stale banner keeps judging the old record's version.
 *
 * @param downloaded - The region record just written.
 */
function syncActiveRegion(downloaded: DownloadedRegion): void {
  const mapStore = useMapStore.getState();
  if (mapStore.activeRegion?.id === downloaded.id) {
    mapStore.setActiveRegion(downloaded);
  }
}
