/**
 * How big a region's download is.
 *
 * Its own module, rather than a corner of `TileManager`, for two reasons. It is
 * pure arithmetic over a manifest entry, while `TileManager` reaches for
 * expo-file-system and SQLite at import time — so anything that only wants to
 * *quote* a size (the downloads screen's offer of neighbouring states, #268)
 * would otherwise pull the whole download machinery in behind it. And the
 * screen tests mock `TileManager` wholesale; a size helper living there is
 * absent from those mocks and throws at render.
 *
 * One definition, used by both the offer and the download, because #268's
 * acceptance includes "sizes shown match what is actually downloaded" and two
 * copies of this sum would not survive that.
 */

import type { Region } from "@bugrout/shared";

/**
 * The packaged fuel file's size, or 0 when the package has none.
 *
 * Keyed off the SHA-256 rather than the size: a package built before fuel was
 * packaged (#200) carries neither, and the app fetches fuel online instead.
 *
 * @param region - The manifest's entry for the region.
 * @returns Size in bytes, or 0.
 */
export function packagedFuelSize(region: Region): number {
  return region.fuelSha256 === undefined ? 0 : (region.fuelSize ?? 0);
}

/**
 * How many bytes downloading this region will actually write.
 *
 * `downloadRegion` divides its progress by this, and the downloads screen
 * quotes it before anything is downloaded.
 *
 * @param region - The manifest's entry for the region.
 * @returns The total size in bytes: map tiles, routing graph and packaged fuel.
 */
export function downloadSizeBytes(region: Region): number {
  return region.pmtilesSize + region.valhallaSize + packagedFuelSize(region);
}
