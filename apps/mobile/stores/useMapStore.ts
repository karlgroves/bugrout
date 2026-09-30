import { create } from "zustand";

import type { PublishedVersions } from "@/services/tiles/TileVersions";
import type { BBox, DownloadedRegion } from "@bugrout/shared";

/**
 *
 */
interface MapState {
  /** Current map viewport bbox */
  viewport: BBox | null;
  /** Currently active/displayed region */
  activeRegion: DownloadedRegion | null;
  /** Whether offline tiles are loaded and ready */
  tilesLoaded: boolean;
  /** Published tile versions from the last manifest fetch; null until one succeeds */
  publishedVersions: PublishedVersions | null;

  setViewport: (bbox: BBox) => void;
  setActiveRegion: (region: DownloadedRegion | null) => void;
  setTilesLoaded: (loaded: boolean) => void;
  setPublishedVersions: (versions: PublishedVersions) => void;
}

export /**
 *
 */
const useMapStore = create<MapState>((set) => ({
  viewport: null,
  activeRegion: null,
  tilesLoaded: false,
  publishedVersions: null,

  setViewport: (bbox) => {
    set({ viewport: bbox });
  },
  setActiveRegion: (region) => {
    set({ activeRegion: region });
  },
  setTilesLoaded: (loaded) => {
    set({ tilesLoaded: loaded });
  },
  setPublishedVersions: (versions) => {
    set({ publishedVersions: versions });
  },
}));
