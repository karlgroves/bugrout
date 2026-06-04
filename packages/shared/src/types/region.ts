import type { BBox } from "./geo";

export interface Region {
  id: string;
  name: string;
  bbox: BBox;
  /** PMTiles file size in bytes */
  pmtilesSize: number;
  /** Valhalla tiles archive size in bytes */
  valhallaSize: number;
  version: string;
  updatedAt: number;
}

export interface DownloadedRegion {
  id: string;
  name: string;
  bbox: BBox;
  pmtilesPath: string;
  valhallaTilesPath: string;
  downloadedAt: number;
  sizeBytes: number;
  version: string;
}
