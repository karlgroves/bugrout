/**
 * The adjacency table is hand-written, so it is checked for the two mistakes a
 * hand-written table of this shape actually makes (#268).
 *
 * Neither is a judgement call about geography: a one-way edge and an id that is
 * not a region are both unambiguously wrong, and both are invisible in review —
 * 51 entries with over 200 edges between them read as plausible whatever they
 * say. The geography itself is argued in the table's own header (land borders
 * only, no Four Corners, no crossing a lake, DC included).
 */

import { REGION_NEIGHBORS } from "@/constants/adjacency";
import { DEFAULT_REGIONS } from "@/constants/regions";

describe("the region adjacency table", () => {
  it("covers every downloadable region", () => {
    const covered = Object.keys(REGION_NEIGHBORS).sort();
    const regions = DEFAULT_REGIONS.map((r) => r.id).sort();

    expect(covered).toEqual(regions);
  });

  it("is symmetric: if A borders B then B borders A", () => {
    const asymmetric: string[] = [];
    for (const [id, neighbors] of Object.entries(REGION_NEIGHBORS)) {
      for (const neighbor of neighbors) {
        if (!REGION_NEIGHBORS[neighbor]?.includes(id)) {
          asymmetric.push(`${id} -> ${neighbor}`);
        }
      }
    }

    expect(asymmetric).toEqual([]);
  });

  it("names only known regions, and never itself", () => {
    const known = new Set(DEFAULT_REGIONS.map((r) => r.id));
    const bad: string[] = [];
    for (const [id, neighbors] of Object.entries(REGION_NEIGHBORS)) {
      for (const neighbor of neighbors) {
        if (!known.has(neighbor)) bad.push(`${id} -> unknown ${neighbor}`);
        if (neighbor === id) bad.push(`${id} -> itself`);
      }
      if (new Set(neighbors).size !== neighbors.length) {
        bad.push(`${id} has duplicates`);
      }
    }

    expect(bad).toEqual([]);
  });

  it("gives Maryland its five land neighbours, DC included", () => {
    // #268's text says four, naming Virginia, Pennsylvania, Delaware and West
    // Virginia. DC is the fifth: it is one of the 51 regions, it shares a land
    // border with Maryland, and Baltimore to Washington is the likeliest
    // cross-border trip a Maryland user makes.
    expect([...(REGION_NEIGHBORS.md ?? [])].sort()).toEqual([
      "dc",
      "de",
      "pa",
      "va",
      "wv",
    ]);
  });

  it("leaves the two states with no land border empty", () => {
    expect(REGION_NEIGHBORS.ak).toEqual([]);
    expect(REGION_NEIGHBORS.hi).toEqual([]);
  });
});
