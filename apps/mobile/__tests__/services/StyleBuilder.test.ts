import { existsSync } from "node:fs";
import { join } from "node:path";

import { buildMapStyle } from "@/services/map/StyleBuilder";

const GLYPHS_DIR = join(__dirname, "../../assets/glyphs");

/** Every font stack the style's layers ask for. */
function fontStacks(style: { layers: { layout?: Record<string, unknown> }[] }) {
  return [
    ...new Set(
      style.layers.flatMap((l) => {
        const fonts = l.layout?.["text-font"];
        return Array.isArray(fonts) ? [(fonts as string[]).join(",")] : [];
      }),
    ),
  ];
}

describe("buildMapStyle", () => {
  it("returns fallback style when no pmtiles path", () => {
    const style = buildMapStyle({ pmtilesPath: null }) as {
      name: string;
      sources: Record<string, unknown>;
      layers: unknown[];
    };
    expect(style.name).toBe("BugRout Online Fallback");
    expect(Object.keys(style.sources)).toEqual(["carto-dark"]);
    expect(style.layers).toHaveLength(2); // Background + CARTO raster
  });

  it("returns full style with tile source when pmtiles path provided", () => {
    const style = buildMapStyle({
      pmtilesPath: "/data/ca.pmtiles",
    }) as {
      name: string;
      sources: Record<string, { type: string; url: string }>;
      layers: unknown[];
    };
    expect(style.name).toBe("BugRout Dark");
    expect(style.sources.openmaptiles).toBeDefined();
    expect(style.sources.openmaptiles!.type).toBe("vector");
    expect(style.layers.length).toBeGreaterThan(5); // Multiple road/water/label layers
  });

  it("points the vector source at the downloaded file via pmtiles://", () => {
    const style = buildMapStyle({
      pmtilesPath: "/data/ca.pmtiles",
    }) as {
      sources: Record<string, { url: string }>;
    };
    expect(style.sources.openmaptiles!.url).toContain("pmtiles://");
  });
});

describe("offline labels (#183)", () => {
  const style = buildMapStyle({
    pmtilesPath: "/data/md.pmtiles",
  }) as { glyphs: string; layers: { layout?: Record<string, unknown> }[] };

  it("loads glyphs from the app bundle, not the internet", () => {
    expect(style.glyphs).toBe("asset://glyphs/{fontstack}/{range}.pbf");
  });

  it("has bundled glyphs for every font the style uses", () => {
    const stacks = fontStacks(style);
    expect(stacks.length).toBeGreaterThan(0);
    for (const stack of stacks) {
      // A missing font fails the whole style, not just its labels. The plugin
      // fills in the empty ranges; the real Latin range must be here.
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed paths inside the repo
      expect(existsSync(join(GLYPHS_DIR, stack, "0-255.pbf"))).toBe(true);
    }
  });
});
