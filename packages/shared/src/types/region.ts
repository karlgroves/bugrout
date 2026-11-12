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
   * MD5 (lowercase hex) of the PMTiles file and of the Valhalla archive
   * (#292). The app checks each download against it before the file replaces
   * anything. MD5, not SHA-256, because expo-file-system hashes a large file
   * natively only with MD5. Absent on a manifest published before the field
   * existed, or for an archive the package does not have; the size check then
   * stands alone.
   */
  pmtilesMd5?: string;
  valhallaMd5?: string;
  /**
   * The packaged fuel stations' size in bytes and SHA-256 (#200). Absent for
   * a package built before fuel was packaged; the app then fetches fuel
   * online instead.
   */
  fuelSize?: number;
  fuelSha256?: string;
  /**
   * The packaged destination search index's size in bytes and SHA-256
   * (#208): a SQLite FTS5 database of the region's addresses and places,
   * built by `data-pipeline/osm/extract-geocode.sh`. Absent for a package
   * built before the index was packaged; search then goes online only.
   */
  geocodeSize?: number;
  geocodeSha256?: string;
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
