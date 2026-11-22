/**
 * Imperative screen-reader announcements go through `announcePolitely` (#383).
 *
 * `announce.test.ts` pins what the helper does. This pins that it is used: a
 * plain `AccessibilityInfo.announceForAccessibility` interrupts speech in
 * progress on iOS, and is the natural thing to write, so without a check here
 * the next announcer added to a screen would bring the defect straight back.
 *
 * Three components predate the helper and still call `AccessibilityInfo`
 * directly. They are listed by name, so the list can only shrink: a file left
 * on it after its call is gone fails too, and moving one onto the helper is
 * the rest of #383.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- reads this repository's own source from a fixed root */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");

/** Directories holding the app's production source. */
const SOURCE_DIRS = [
  "app",
  "components",
  "constants",
  "db",
  "hooks",
  "platform",
  "services",
  "stores",
  "utils",
];

/** The helper itself, which is where the direct call belongs. */
const HELPER = "utils/announce.ts";

/** Direct callers that have not moved onto the helper yet (#383). */
const NOT_YET_MOVED = [
  "components/routing/DroppedStopNotice.tsx",
  "components/routing/RouteUnavailableNotice.tsx",
  "components/routing/UnavoidedThreatNotice.tsx",
];

/** Either form of the call: the plain one and the one with options. */
const DIRECT_CALL =
  /\bAccessibilityInfo\s*\.\s*announceForAccessibility\w*\s*\(/;

/**
 * Every .ts/.tsx file under `dir`, relative to the app root.
 *
 * @param dir - A directory relative to the app root.
 * @returns The files beneath it, recursively.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(join(APP_ROOT, dir), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => relative(APP_ROOT, join(entry.parentPath, entry.name)));
}

/**
 * The file with its comments removed, so a comment that names the call (as
 * the helper's own docblock does) is not mistaken for one.
 *
 * @param source - The file's contents.
 * @returns The source with block and line comments blanked out.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const callers = SOURCE_DIRS.flatMap(sourceFiles)
  .filter((file) =>
    DIRECT_CALL.test(
      withoutComments(readFileSync(join(APP_ROOT, file), "utf8")),
    ),
  )
  .sort();

describe("announcement call sites", () => {
  it("finds the helper, so the scan is reading the right files", () => {
    expect(callers).toContain(HELPER);
  });

  it("calls AccessibilityInfo directly only from the helper", () => {
    const unexpected = callers.filter(
      (file) => file !== HELPER && !NOT_YET_MOVED.includes(file),
    );
    expect(unexpected).toEqual([]);
  });

  it("drops a component from the not-yet-moved list once it moves", () => {
    const moved = NOT_YET_MOVED.filter((file) => !callers.includes(file));
    expect(moved).toEqual([]);
  });
});
