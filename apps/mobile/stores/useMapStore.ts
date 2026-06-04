import { create } from "zustand";

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

  setViewport: (bbox: BBox) => void;
  setActiveRegion: (region: DownloadedRegion | null) => void;
  setTilesLoaded: (loaded: boolean) => void;
}

export /**
 *
 */
const useMapStore = create<MapState>((set) => ({
  viewport: null,
  activeRegion: null,
  tilesLoaded: false,

  setViewport: (bbox) => { set({ viewport: bbox }); },
  setActiveRegion: (region) => { set({ activeRegion: region }); },
  setTilesLoaded: (loaded) => { set({ tilesLoaded: loaded }); },
}));
