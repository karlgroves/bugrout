/**
 * Offline-map freshness.
 *
 * A downloaded region is stale when a newer version of it has been published.
 * The manifest says what is published; only when it cannot be fetched (the
 * device is offline, or the region is no longer listed) does the age of the
 * download stand in for it (#179).
 *
 * Staleness used to be age alone — `downloadedAt` older than 90 days — while
 * the stored `version` was never compared. A region downloaded the morning a
 * new version shipped was not flagged for three months, and one downloaded 91
 * days ago was flagged even when nothing newer existed.
 */

import type { DownloadedRegion, Region } from "@bugrout/shared";

/** Published tile version per region id, from the tile manifest. */
export type PublishedVersions = Readonly<Record<string, string>>;

/** Age past which a region counts as stale when its published version is unknown. */
const STALE_THRESHOLD_DAYS = 90;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Index a manifest's regions by id.
 *
 * @param regions - Regions from the tile manifest.
 * @returns Each region's published version, keyed by region id.
 */
export function publishedVersionsFrom(regions: Region[]): PublishedVersions {
  return Object.fromEntries(regions.map((r) => [r.id, r.version]));
}

/**
 * Whether a downloaded region should be updated.
 *
 * @param region - The downloaded region.
 * @param published - Published versions from the manifest, or `null` when it
 *   could not be fetched.
 * @param now - Current time in ms; injectable for tests.
 * @returns `true` when a different version is published, or — when the
 *   published version is unknown — when the download is over 90 days old.
 */
export function isRegionStale(
  region: DownloadedRegion,
  published: PublishedVersions | null,
  now: number = Date.now(),
): boolean {
  const current = published ? publishedVersionOf(published, region.id) : null;
  if (current !== null) return current !== region.version;
  return (now - region.downloadedAt) / MS_PER_DAY > STALE_THRESHOLD_DAYS;
}

/**
 * The published version of one region.
 *
 * @param published - Published versions from the manifest.
 * @param regionId - The region.
 * @returns Its version, or `null` when the manifest does not list it.
 */
function publishedVersionOf(
  published: PublishedVersions,
  regionId: string,
): string | null {
  const entry = Object.entries(published).find(([id]) => id === regionId);
  return entry ? entry[1] : null;
}
