/**
 * A downloaded region is stale when a newer version is published (#179).
 *
 * Before, staleness was download age alone: a region downloaded the morning a
 * new version shipped went unflagged for 90 days, and one downloaded 91 days
 * ago was flagged even when nothing newer existed.
 */
import {
  isRegionStale,
  publishedVersionsFrom,
} from "@/services/tiles/TileVersions";

import type { DownloadedRegion, Region } from "@bugrout/shared";

const DAY = 1000 * 60 * 60 * 24;
const NOW = Date.UTC(2026, 8, 30);

function downloaded(version: string, ageDays: number): DownloadedRegion {
  return {
    id: "md",
    name: "Maryland",
    bbox: { west: -79.49, south: 37.89, east: -75.05, north: 39.72 },
    pmtilesPath: "file:///docs/tiles/md/md.pmtiles",
    valhallaTilesPath: "file:///docs/tiles/md/md.valhalla.tar.gz",
    downloadedAt: NOW - ageDays * DAY,
    sizeBytes: 145_188_267,
    version,
  };
}

const MANIFEST: Region[] = [
  {
    id: "md",
    name: "Maryland",
    bbox: { west: -79.49, south: 37.89, east: -75.05, north: 39.72 },
    pmtilesSize: 145_188_267,
    valhallaSize: 0,
    version: "2026.09.28",
    updatedAt: NOW,
  },
];
const PUBLISHED = publishedVersionsFrom(MANIFEST);

describe("isRegionStale", () => {
  it("is stale when a newer version is published, however recent the download", () => {
    // Downloaded today, but it is April's data.
    expect(isRegionStale(downloaded("2026.04.12", 0), PUBLISHED, NOW)).toBe(
      true,
    );
  });

  it("is not stale when the published version matches, even past 90 days", () => {
    expect(isRegionStale(downloaded("2026.09.28", 200), PUBLISHED, NOW)).toBe(
      false,
    );
  });

  describe("without a manifest (offline)", () => {
    it("falls back to download age: stale past 90 days", () => {
      expect(isRegionStale(downloaded("2026.04.12", 91), null, NOW)).toBe(true);
    });

    it("falls back to download age: fresh within 90 days", () => {
      expect(isRegionStale(downloaded("2026.04.12", 89), null, NOW)).toBe(
        false,
      );
    });
  });

  it("falls back to download age when the manifest no longer lists the region", () => {
    const withoutMaryland = publishedVersionsFrom([]);
    expect(
      isRegionStale(downloaded("2026.04.12", 10), withoutMaryland, NOW),
    ).toBe(false);
    expect(
      isRegionStale(downloaded("2026.04.12", 120), withoutMaryland, NOW),
    ).toBe(true);
  });
});

describe("publishedVersionsFrom", () => {
  it("indexes each region's version by id", () => {
    expect(publishedVersionsFrom(MANIFEST)).toEqual({ md: "2026.09.28" });
  });
});
