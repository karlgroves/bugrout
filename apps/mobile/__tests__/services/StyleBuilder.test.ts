import { buildMapStyle } from "@/services/map/StyleBuilder";

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
