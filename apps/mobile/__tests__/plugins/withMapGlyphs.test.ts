/**
 * The glyphs plugin writes a complete glyph set for the native bundles (#183).
 *
 * MapLibre requests every 256-codepoint range a label's text touches, and a
 * range it cannot load fails the whole style — the map draws nothing. The repo
 * keeps only the ranges a font has glyphs in; the plugin must fill in the rest.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- temp directories this test creates */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { IOSConfig } from "expo/config-plugins";

/** The slice of the `xcode` package's project this test drives. */
interface XcodeProject {
  writeSync: () => string;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the plugin is CommonJS, loaded by expo prebuild
const plugin = require("../../plugins/withMapGlyphs") as {
  materializeGlyphs: (source: string, target: string) => void;
  emptyRange: (font: string, range: string) => Buffer;
  addGlyphsFolder: (project: XcodeProject, projectName: string) => void;
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

describe("emptyRange", () => {
  it("refuses a font name too long for its one-byte lengths", () => {
    expect(() => plugin.emptyRange("x".repeat(120), "0-255")).toThrow(
      /too long/,
    );
  });
});

describe("addGlyphsFolder", () => {
  let root: string;

  /** Parse the fixture — a trimmed Expo template project — from a temp root. */
  function loadProject(): XcodeProject {
    const dir = join(root, "ios", "BugRout.xcodeproj");
    mkdirSync(dir, { recursive: true });
    copyFileSync(
      join(__dirname, "fixtures", "project.pbxproj"),
      join(dir, "project.pbxproj"),
    );
    // Typed from the `xcode` package, which this workspace has no types for.
    const project: unknown = IOSConfig.XcodeUtils.getPbxproj(root);
    return project as XcodeProject;
  }

  /** The written project's lines that mention the glyphs folder. */
  const glyphLines = (project: XcodeProject) =>
    project
      .writeSync()
      .split("\n")
      .filter((line) => line.includes("glyphs"));

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "xcode-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("bundles the folder: a reference, a group child, and a Resources entry", () => {
    const project = loadProject();

    plugin.addGlyphsFolder(project, "BugRout");

    const lines = glyphLines(project);
    // The folder reference, relative to the ios/ source root.
    expect(
      lines.some(
        (l) =>
          l.includes("isa = PBXFileReference") &&
          l.includes('path = "BugRout/glyphs"') &&
          l.includes("lastKnownFileType = folder") &&
          l.includes("sourceTree = SOURCE_ROOT"),
      ),
    ).toBe(true);
    // Its build file, and that build file listed in the Resources phase.
    expect(lines.some((l) => l.includes("glyphs in Resources */ = {"))).toBe(
      true,
    );
    expect(
      lines.filter((l) => /^\s+\w+ \/\* glyphs in Resources \*\/,$/.test(l)),
    ).toHaveLength(1);
    // A child of the app's group, so it shows up in the project navigator.
    expect(
      lines.filter((l) => /^\s+\w+ \/\* glyphs \*\/,$/.test(l)),
    ).toHaveLength(1);
  });

  it("writes no literal `undefined` values into the project", () => {
    const project = loadProject();

    plugin.addGlyphsFolder(project, "BugRout");

    expect(project.writeSync()).not.toMatch(/= undefined;/);
  });

  it("adds the folder once when prebuild runs again", () => {
    const project = loadProject();

    plugin.addGlyphsFolder(project, "BugRout");
    plugin.addGlyphsFolder(project, "BugRout");

    expect(
      glyphLines(project).filter((l) => l.includes("isa = PBXFileReference")),
    ).toHaveLength(1);
  });

  it("fails loudly when the app's group is missing", () => {
    const project = loadProject();

    expect(() => {
      plugin.addGlyphsFolder(project, "NotTheApp");
    }).toThrow(/no "NotTheApp" group/);
  });
});
