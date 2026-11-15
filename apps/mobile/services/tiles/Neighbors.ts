/**
 * Which neighbouring regions to offer after a download (#268, ADR 0008's M2).
 *
 * An evacuation crosses a state line as a matter of course, and the download
 * has to happen while there is still signal. So once a region is on the device,
 * the states next to it are offered — with the size shown before anything is
 * downloaded, not after.
 *
 * Two things this deliberately does not do:
 *
 *   - **It never quotes a size it cannot stand behind.** A neighbour is only
 *     offered when the manifest actually publishes it, and the figure shown is
 *     `downloadSizeBytes` — the same sum `downloadRegion` reports as its total.
 *     The estimates in `DEFAULT_REGIONS` (a hand-set `pmtilesMB`/`valhallaMB`
 *     per state) are a display fallback for the region list, not measurements,
 *     and presenting one as a download size would break #268's "sizes shown
 *     match what is actually downloaded". An unpublished neighbour is named
 *     with no size and no button instead, which is also the answer #147 asks
 *     for: a listed-but-unpublished region should say so rather than offer a
 *     download that fails.
 *   - **It says nothing about routing.** Downloading Virginia extends the map
 *     and the bbox the save-time coverage check tests against, but the routing
 *     graph is still Maryland-only until #267 (R1) widens it. The caller is
 *     responsible for not implying otherwise; `NearbyStates` carries that copy.
 */

import { REGION_NEIGHBORS } from "@/constants/adjacency";
import { DEFAULT_REGIONS } from "@/constants/regions";
import { downloadSizeBytes } from "@/services/tiles/regionSize";

import type { Region } from "@bugrout/shared";

/**
 * A neighbour the manifest publishes, with the size its download will write.
 *
 * Not exported: callers reach it through {@link NeighborOffers}, structurally.
 * An export nothing imports is a knip finding, and the gate is zero.
 */
interface NeighborOffer {
  region: Region;
  sizeBytes: number;
}

/** A neighbour that is adjacent but not published, so there is nothing to download. */
interface UnpublishedNeighbor {
  id: string;
  name: string;
}

/** What to show under a downloaded region. */
export interface NeighborOffers {
  offers: NeighborOffer[];
  unpublished: UnpublishedNeighbor[];
}

/** A region's display name, from the manifest if it is there, else the seed list. */
function nameOf(id: string, available: readonly Region[]): string {
  return (
    available.find((r) => r.id === id)?.name ??
    DEFAULT_REGIONS.find((r) => r.id === id)?.name ??
    id.toUpperCase()
  );
}

/**
 * The neighbours to offer for a region the user has downloaded.
 *
 * Adjacency comes from the manifest's own `neighbors` when the region carries
 * it, so the pipeline can override this without an app release
 * (`data-pipeline/regions/region-definitions.json`); the live manifest predates
 * the field, so today every region falls back to {@link REGION_NEIGHBORS}.
 *
 * @param regionId - The downloaded region.
 * @param available - Regions the manifest publishes.
 * @param downloadedIds - Regions already on the device, which are not offered.
 * @returns Publishable neighbours with sizes, and adjacent ones that are not published.
 */
export function neighborOffers(
  regionId: string,
  available: readonly Region[],
  downloadedIds: readonly string[],
): NeighborOffers {
  const manifestNeighbors = available.find((r) => r.id === regionId)?.neighbors;
  const neighborIds =
    manifestNeighbors ??
    // `Object.hasOwn` rather than a bare index: `regionId` comes from the
    // manifest, and an inherited key like `constructor` would otherwise
    // return a truthy non-array that `?? []` does not catch.
    (Object.hasOwn(REGION_NEIGHBORS, regionId)
      ? (REGION_NEIGHBORS[regionId] ?? [])
      : []);
  const downloaded = new Set(downloadedIds);

  const offers: NeighborOffer[] = [];
  const unpublished: UnpublishedNeighbor[] = [];

  for (const id of neighborIds) {
    if (downloaded.has(id)) continue;
    const region = available.find((r) => r.id === id);
    if (region) offers.push({ region, sizeBytes: downloadSizeBytes(region) });
    else unpublished.push({ id, name: nameOf(id, available) });
  }

  return { offers, unpublished };
}
