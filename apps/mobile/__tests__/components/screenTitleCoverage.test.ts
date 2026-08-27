/**
 * Every screen sets a document title.
 *
 * `ScreenTitle.test.tsx` pins the wrapper's behaviour. Nothing pinned its
 * *application* — unwrapping a screen's default export left all 224 tests
 * green, and that screen would then silently render with whatever title the
 * previous route had set. Same gap as the Sentry `beforeSend` wiring in #86.
 *
 * This is a source-level check rather than a behavioural one, deliberately.
 * The property is itself source-level ("each screen file wraps its export"),
 * and importing twelve screens to assert it would pull in MapLibre, SQLite and
 * the rest for no additional signal.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- this test's whole
   job is to walk app/ and read every screen it finds; the paths are derived
   from __dirname and a directory listing, never from input. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.join(__dirname, "..", "..", "app");

/**
 * Every screen file under app/, excluding layouts and Expo Router specials.
 *
 * @param dir - Directory to walk.
 * @returns Absolute paths of screen modules.
 */
function screenFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...screenFiles(full));
      continue;
    }
    if (!entry.endsWith(".tsx")) continue;
    if (entry === "_layout.tsx") continue;
    if (entry.startsWith("+")) continue;
    out.push(full);
  }
  return out;
}

describe("document titles cover every screen", () => {
  const files = screenFiles(APP_DIR);

  it("finds the screens at all", () => {
    // Guards the walker: a glob that silently matches nothing would make every
    // assertion below vacuously true.
    expect(files.length).toBeGreaterThanOrEqual(12);
  });

  it.each(files.map((f) => [path.relative(APP_DIR, f), f]))(
    "%s wraps its default export with withScreenTitle",
    (_label, file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/export default withScreenTitle\(\s*\w+/);
    },
  );

  it("gives each screen a distinct title", () => {
    // Two screens sharing a title is the failure this is meant to prevent, in
    // a slightly different shape: identical browser tabs and identical
    // screen-reader page announcements.
    const titles = files.map((f) => {
      const m = /export default withScreenTitle\(\s*\w+\s*,\s*"([^"]+)"/.exec(
        readFileSync(f, "utf8"),
      );
      return m?.[1];
    });
    expect(titles.every((t) => typeof t === "string" && t.length > 0)).toBe(
      true,
    );
    expect(new Set(titles).size).toBe(titles.length);
  });
});
