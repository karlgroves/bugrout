import { buildMapStyle, styleToDataUri } from "@/services/map/StyleBuilder";

describe("buildMapStyle", () => {
  it("returns fallback style when no pmtiles path", () => {
    const style = buildMapStyle({ pmtilesPath: null }) as {
      name: string;
      sources: Record<string, unknown>;
      layers: unknown[];
    };
    expect(style.name).toBe("BugRout Fallback");
    expect(Object.keys(style.sources)).toHaveLength(0);
    expect(style.layers).toHaveLength(1); // Just background
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
    expect(style.sources.openmaptiles.type).toBe("vector");
    expect(style.layers.length).toBeGreaterThan(5); // Multiple road/water/label layers
  });

  it("uses localhost URL when tileServerPort provided", () => {
    const style = buildMapStyle({
      pmtilesPath: "/data/ca.pmtiles",
      tileServerPort: 3000,
    }) as {
      sources: Record<string, { url: string }>;
    };
    expect(style.sources.openmaptiles.url).toContain("localhost:3000");
  });

  it("uses pmtiles:// protocol when no port", () => {
    const style = buildMapStyle({
      pmtilesPath: "/data/ca.pmtiles",
    }) as {
      sources: Record<string, { url: string }>;
    };
    expect(style.sources.openmaptiles.url).toContain("pmtiles://");
  });
});

describe("styleToDataUri", () => {
  it("encodes style to data URI", () => {
    const style = { version: 8, layers: [] };
    const uri = styleToDataUri(style);
    expect(uri).toStartWith("data:application/json,");
    expect(uri).toContain(encodeURIComponent('"version":8'));
  });
});

// Polyfill for toStartWith (jest doesn't have it by default)
expect.extend({
  toStartWith(received: string, prefix: string) {
    const pass = received.startsWith(prefix);
    return {
      pass,
      message: () =>
        `expected "${received.slice(0, 50)}..." to ${pass ? "not " : ""}start with "${prefix}"`,
    };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toStartWith(prefix: string): R;
    }
  }
}
