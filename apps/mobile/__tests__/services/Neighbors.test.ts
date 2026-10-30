/**
 * What gets offered after a region is downloaded (#268, ADR 0008's M2).
 *
 * The acceptance criterion with teeth is "sizes shown match what is actually
 * downloaded", so the size here is asserted against `downloadSizeBytes` — the
 * same sum `downloadRegion` divides its progress by — and an unpublished
 * neighbour is asserted to come back with *no* size rather than with the
 * hand-set estimate in `DEFAULT_REGIONS`, which is a display fallback and not a
 * measurement.
 */

import { neighborOffers } from "@/services/tiles/Neighbors";
import { downloadSizeBytes } from "@/services/tiles/regionSize";

import type { Region } from "@bugrout/shared";

const BBOX = { west: -1, south: -1, east: 1, north: 1 };

/**
 * A published region.
 *
 * @param id - Region id.
 * @param name - Display name.
 * @param extra - Fields to override, e.g. sizes or `neighbors`.
 * @returns The region.
 */
function region(id: string, name: string, extra: Partial<Region> = {}): Region {
  return {
    id,
    name,
    bbox: BBOX,
    pmtilesSize: 1000,
    valhallaSize: 200,
    version: "2026.10.28",
    updatedAt: 0,
    ...extra,
  };
}

describe("neighborOffers", () => {
  it("offers a published neighbour with the size its download will write", () => {
    const va = region("va", "Virginia", {
      pmtilesSize: 4000,
      valhallaSize: 500,
      fuelSize: 70,
      fuelSha256: "abc",
    });
    const { offers, unpublished } = neighborOffers(
      "md",
      [region("md", "Maryland"), va],
      ["md"],
    );

    expect(offers).toHaveLength(1);
    expect(offers[0]?.region.id).toBe("va");
    expect(offers[0]?.sizeBytes).toBe(downloadSizeBytes(va));
    // 4000 + 500 + 70 — the fuel file counts, because the download fetches it.
    expect(offers[0]?.sizeBytes).toBe(4570);
    // Maryland's other four neighbours are adjacent but unpublished, so they
    // are named without a size rather than left out: #147 asks the downloads
    // screen to say so instead of offering a download that fails.
    expect(unpublished.map((n) => n.id).sort()).toEqual([
      "dc",
      "de",
      "pa",
      "wv",
    ]);
  });

  it("names an unpublished neighbour with no size and nothing to download", () => {
    const { offers, unpublished } = neighborOffers(
      "md",
      [region("md", "Maryland")],
      ["md"],
    );

    expect(offers).toEqual([]);
    // All five of Maryland's neighbours, none of them published today.
    expect(unpublished.map((n) => n.id).sort()).toEqual([
      "dc",
      "de",
      "pa",
      "va",
      "wv",
    ]);
    // Named from the seed list so the row reads "Virginia", not "va" — but
    // carrying no size, because there is no published package to measure.
    expect(unpublished.find((n) => n.id === "va")?.name).toBe("Virginia");
    for (const entry of unpublished) {
      expect(entry).not.toHaveProperty("sizeBytes");
    }
  });

  it("does not offer a neighbour that is already downloaded", () => {
    const { offers, unpublished } = neighborOffers(
      "md",
      [region("md", "Maryland"), region("va", "Virginia")],
      ["md", "va"],
    );

    expect(offers).toEqual([]);
    expect(unpublished.map((n) => n.id)).not.toContain("va");
  });

  it("prefers the manifest's own adjacency over the built-in table", () => {
    // The pipeline publishes `neighbors` (build-manifest.sh), so a correction
    // there must not need an app release.
    const { offers, unpublished } = neighborOffers(
      "md",
      [
        region("md", "Maryland", { neighbors: ["de"] }),
        region("de", "Delaware"),
        region("va", "Virginia"),
      ],
      ["md"],
    );

    expect(offers.map((o) => o.region.id)).toEqual(["de"]);
    expect(unpublished).toEqual([]);
  });

  it("treats a published empty adjacency as 'no neighbours', not 'unknown'", () => {
    // Alaska and Hawaii. An empty list must not fall through to the table.
    const { offers, unpublished } = neighborOffers(
      "md",
      [region("md", "Maryland", { neighbors: [] }), region("va", "Virginia")],
      ["md"],
    );

    expect(offers).toEqual([]);
    expect(unpublished).toEqual([]);
  });

  it("offers nothing for a region it has never heard of", () => {
    const { offers, unpublished } = neighborOffers("zz", [], []);

    expect(offers).toEqual([]);
    expect(unpublished).toEqual([]);
  });

  it("ignores an inherited key rather than treating it as adjacency", () => {
    // `regionId` comes from the manifest, so a lookup on a plain object would
    // answer for "constructor" with something that is not an array.
    expect(() => neighborOffers("constructor", [], [])).not.toThrow();
    expect(neighborOffers("constructor", [], [])).toEqual({
      offers: [],
      unpublished: [],
    });
  });
});
