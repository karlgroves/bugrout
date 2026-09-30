/**
 * Bundle the map's label glyphs into the native apps (#183).
 *
 * The style loads glyphs from `asset://glyphs/{fontstack}/{range}.pbf`, so
 * labels render with no network. MapLibre resolves `asset://` against the iOS
 * app bundle and Android's `assets/`. A missing range fails the whole style —
 * with glyphs fetched from the internet, an offline device drew no map at all.
 *
 * `assets/glyphs/<font>/` holds only the ranges the font actually has glyphs
 * in. MapLibre still requests any range a label's text touches, so at prebuild
 * the full set of 256 ranges is written out: real files copied, every other
 * range an empty glyph set, byte-identical to what the glyph server returns.
 *
 * - iOS: written to `ios/<Project>/glyphs`, added to the app target as a
 *   folder reference in Copy Bundle Resources, so it lands as `glyphs/…`.
 * - Android: written to `android/app/src/main/assets/glyphs`.
 */

const fs = require("node:fs");
const path = require("node:path");

const {
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} = require("expo/config-plugins");

const SOURCE_DIR = path.join("assets", "glyphs");
const RANGE_SIZE = 256;
const RANGE_COUNT = 256;

/**
 * An empty glyph set for one range, as a protobuf `glyphs` message:
 * `stacks { name: <font>, range: "<start>-<end>" }` with no glyphs.
 *
 * @param {string} font - Font stack name, e.g. "Open Sans Regular".
 * @param {string} range - e.g. "1536-1791".
 * @returns {Buffer}
 */
function emptyRange(font, range) {
  const name = Buffer.from(font, "utf8");
  // Lengths are written as one-byte varints, which only covers 0-127. The
  // message is at most ~40 bytes for real font names; a longer one must fail
  // here rather than produce a range MapLibre cannot parse.
  if (name.length + range.length + 4 > 127) {
    throw new Error(`withMapGlyphs: font name too long: "${font}"`);
  }
  const rangeBytes = Buffer.from(range, "utf8");
  const stack = Buffer.concat([
    Buffer.from([0x0a, name.length]),
    name,
    Buffer.from([0x12, rangeBytes.length]),
    rangeBytes,
  ]);
  return Buffer.concat([Buffer.from([0x0a, stack.length]), stack]);
}

/**
 * Write the complete glyph set — 256 ranges per font — to `targetDir`.
 *
 * @param {string} sourceDir - `assets/glyphs`, one directory per font.
 * @param {string} targetDir - Where the bundle-ready set goes; replaced.
 */
function materializeGlyphs(sourceDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  const fonts = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const font of fonts) {
    const fontTarget = path.join(targetDir, font);
    fs.mkdirSync(fontTarget, { recursive: true });
    for (let i = 0; i < RANGE_COUNT; i++) {
      const range = `${i * RANGE_SIZE}-${i * RANGE_SIZE + RANGE_SIZE - 1}`;
      const file = `${range}.pbf`;
      const source = path.join(sourceDir, font, file);
      const target = path.join(fontTarget, file);
      if (fs.existsSync(source)) fs.copyFileSync(source, target);
      else fs.writeFileSync(target, emptyRange(font, range));
    }
  }
}

/**
 * Write the glyphs into the iOS project and add them to the app target as a
 * bundled folder reference.
 *
 * @param {import("expo/config-plugins").ExpoConfig} config
 * @returns {import("expo/config-plugins").ExpoConfig}
 */
function withIosGlyphs(config) {
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      materializeGlyphs(
        path.join(projectRoot, SOURCE_DIR),
        path.join(platformProjectRoot, projectName, "glyphs"),
      );
      return cfg;
    },
  ]);
  return withXcodeProject(config, (cfg) => {
    addGlyphsFolder(
      cfg.modResults,
      IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot),
    );
    return cfg;
  });
}

/**
 * Add `<Project>/glyphs` to the app target as a folder reference in Copy
 * Bundle Resources, so it lands in the bundle as `glyphs/…`. Does nothing if
 * it is already there.
 *
 * @param {import("expo/config-plugins").XcodeProject} project - The parsed project.
 * @param {string} projectName - The app's Xcode project and group name.
 */
function addGlyphsFolder(project, projectName) {
  const relative = path.join(projectName, "glyphs");
  if (project.hasFile(relative)) return;

  const groupKey =
    project.findPBXGroupKey({ name: projectName }) ??
    project.findPBXGroupKey({ path: projectName });
  if (!groupKey) {
    throw new Error(`withMapGlyphs: no "${projectName}" group in Xcode`);
  }
  // Done by hand: `addResourceFile` looks up a group named "Resources",
  // which Expo's template does not have, and throws.
  const file = project.addFile(relative, groupKey, {
    lastKnownFileType: "folder",
    sourceTree: "SOURCE_ROOT",
  });
  if (!file) {
    throw new Error(`withMapGlyphs: could not add ${relative} to Xcode`);
  }
  // The xcode package copies options it was not given onto the reference as
  // `undefined`, which it then writes out literally
  // (`explicitFileType = undefined;`). Drop them.
  const reference = project.pbxFileReferenceSection()[file.fileRef];
  for (const key of Object.keys(reference)) {
    if (reference[key] === undefined) delete reference[key];
  }
  file.uuid = project.generateUuid();
  file.target = project.getFirstTarget().uuid;
  project.addToPbxBuildFileSection(file);
  project.addToPbxResourcesBuildPhase(file);
}

/**
 * Write the glyphs into the Android app's assets.
 *
 * @param {import("expo/config-plugins").ExpoConfig} config
 * @returns {import("expo/config-plugins").ExpoConfig}
 */
function withAndroidGlyphs(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const { projectRoot, platformProjectRoot } = cfg.modRequest;
      materializeGlyphs(
        path.join(projectRoot, SOURCE_DIR),
        path.join(
          platformProjectRoot,
          "app",
          "src",
          "main",
          "assets",
          "glyphs",
        ),
      );
      return cfg;
    },
  ]);
}

/**
 * @param {import("expo/config-plugins").ExpoConfig} config
 * @returns {import("expo/config-plugins").ExpoConfig}
 */
function withMapGlyphs(config) {
  return withAndroidGlyphs(withIosGlyphs(config));
}

module.exports = withMapGlyphs;
module.exports.materializeGlyphs = materializeGlyphs;
module.exports.emptyRange = emptyRange;
module.exports.addGlyphsFolder = addGlyphsFolder;
