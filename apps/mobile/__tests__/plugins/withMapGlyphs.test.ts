/**
 * The glyphs plugin writes a complete glyph set for the native bundles (#183).
 *
 * MapLibre requests every 256-codepoint range a label's text touches, and a
 * range it cannot load fails the whole style — the map draws nothing. The repo
 * keeps only the ranges a font has glyphs in; the plugin must fill in the rest.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- temp directories this test creates */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the plugin is CommonJS, loaded by expo prebuild
const plugin = require("../../plugins/withMapGlyphs") as {
  materializeGlyphs: (source: string, target: string) => void;
  emptyRange: (font: string, range: string) => Buffer;
};

const SOURCE = join(__dirname, "../../assets/glyphs");

describe("materializeGlyphs", () => {
  let target: string;

  beforeEach(() => {
    target = mkdtempSync(join(tmpdir(), "glyphs-"));
  });

  afterEach(() => {
    rmSync(target, { recursive: true, force: true });
  });

  it("writes all 256 ranges for every bundled font", () => {
    plugin.materializeGlyphs(SOURCE, target);

    const fonts = readdirSync(target);
    expect(fonts.sort()).toEqual(["Open Sans Bold", "Open Sans Regular"]);
    for (const font of fonts) {
      const files = readdirSync(join(target, font));
      expect(files).toHaveLength(256);
      expect(files).toContain("0-255.pbf");
      expect(files).toContain("65280-65535.pbf");
    }
  });

  it("copies the real glyph files unchanged", () => {
    plugin.materializeGlyphs(SOURCE, target);

    const file = join("Open Sans Regular", "0-255.pbf");
    expect(readFileSync(join(target, file))).toEqual(
      readFileSync(join(SOURCE, file)),
    );
  });

  it("fills an uncovered range with the empty glyph set the server returns", () => {
    plugin.materializeGlyphs(SOURCE, target);

    // Byte-for-byte what fonts.openmaptiles.org serves for this range.
    expect(
      readFileSync(join(target, "Open Sans Regular", "1536-1791.pbf")),
    ).toEqual(
      Buffer.from(
        "0a1e0a114f70656e2053616e7320526567756c61721209313533362d31373931",
        "hex",
      ),
    );
  });

  it("replaces whatever was in the target before", () => {
    writeFileSync(join(target, "stale.pbf"), "stale");

    plugin.materializeGlyphs(SOURCE, target);

    expect(existsSync(join(target, "stale.pbf"))).toBe(false);
  });
});
