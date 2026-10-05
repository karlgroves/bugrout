/**
 * Only active navigation holds the screen awake (spec §7.1, #198).
 *
 * `NavigationKeepAwake.test.ts` pins that navigation takes and releases the
 * hold. Nothing there would notice a second holder, such as a `useKeepAwake()`
 * dropped into a screen, which would keep the display on, and the battery
 * draining, outside a trip. This is a source-level check because the property
 * is source-level: who references keep-awake at all.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- this test walks the
   app's own source tree; paths come from __dirname and directory listings,
   never from input. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..", "..");
const SOURCE_DIRS = [
  "app",
  "components",
  "hooks",
  "services",
  "stores",
  "platform",
  "utils",
  "db",
];

/**
 * Every .ts/.tsx file under `dir`.
 *
 * @param dir - Directory to walk.
 * @returns Absolute paths.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Repo-relative paths of source files whose text matches `pattern`. */
function filesMatching(pattern: RegExp): string[] {
  return SOURCE_DIRS.flatMap((d) => sourceFiles(path.join(ROOT, d)))
    .filter((f) => pattern.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f))
    .sort();
}

describe("keep-awake scope", () => {
  it("only the platform shim reaches expo-keep-awake", () => {
    expect(
      filesMatching(/expo-keep-awake|useKeepAwake|activateKeepAwake/),
    ).toEqual(["platform/keepAwake.ts"]);
  });

  it("only NavigationController uses the shim", () => {
    expect(filesMatching(/@\/platform\/keepAwake/)).toEqual([
      "services/navigation/NavigationController.ts",
    ]);
  });
});
