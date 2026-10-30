import type { BBox } from "./geo";

/**
 * A downloadable map region with tile metadata and sizes.
 */
export interface Region {
  id: string;
  name: string;
  bbox: BBox;
  /** PMTiles file size in bytes */
  pmtilesSize: number;
  /** Valhalla tiles archive size in bytes */
  valhallaSize: number;
  /**
   * The packaged fuel stations' size in bytes and SHA-256 (#200). Absent for
   * a package built before fuel was packaged; the app then fetches fuel
   * online instead.
   */
  fuelSize?: number;
  fuelSha256?: string;
  /**
   * Region ids sharing a land border with this one, offered after it is
   * downloaded (#268). Absent on a manifest published before the field
   * existed; the app then falls back to its own adjacency table.
   */
  neighbors?: readonly string[];
  version: string;
  updatedAt: number;
}

/**
 * A region whose offline tiles have been downloaded to the device.
 */
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
