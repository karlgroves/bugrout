/**
 * The screens on the per-GPS-tick path read their stores through selectors (#189).
 *
 * The behaviour is pinned in `stores/routeStoreNotifications.test.ts`. This
 * pins the *call style*, because that is what regresses: `useRouteStore()` and
 * `const { units } = useSettingsStore()` are the natural things to write, they
 * type-check, they work, and the cost — a re-render on every write to any
 * field of the store, including ones the component never reads — is invisible
 * at the call site and only shows up as a laggy screen on a real device.
 *
 * Scoped to the three files that render while NavigationController is running:
 * the navigation screen, the map screen (which stays mounted under the tab
 * navigator behind it) and the scenario chips on that map. Twenty-two other
 * call sites in the app still subscribe to a whole store; they are not on this
 * path and are left alone deliberately rather than swept up in a fix for #189.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- reads this repository's own source from a fixed root */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");

/** Files that render on every position update while navigating. */
const PER_TICK_FILES = [
  "app/navigation/[routeId].tsx",
  "app/(tabs)/index.tsx",
  "components/map/ScenarioChips.tsx",
];

/**
 * A store hook called with no selector, i.e. subscribed to the whole store.
 *
 * Matches `useFooStore()` but not `useFooStore((s) => ...)` and not
 * `useFooStore.getState()`, which takes no subscription at all.
 */
const WHOLE_STORE_CALL = /\buse[A-Z][A-Za-z]*Store\(\s*\)/g;

/**
 * The file with its comments removed.
 *
 * Needed, not cosmetic: the comments explaining *why* these call sites use
 * selectors name the old call shape, so matching the raw text reports the
 * explanation as the defect. Caught by this test failing on both files it had
 * just been written to pass.
 *
 * @param source - The file's contents.
 * @returns The source with block and line comments blanked out.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

describe("subscriptions on the navigation path", () => {
  for (const file of PER_TICK_FILES) {
    it(`${file} subscribes with selectors, not to a whole store`, () => {
      const code = withoutComments(readFileSync(join(APP_ROOT, file), "utf8"));
      const offenders = [...code.matchAll(WHOLE_STORE_CALL)].map((m) => m[0]);

      expect(offenders).toEqual([]);
    });
  }

  it("still reads the stores it needs, so the check is not vacuous", () => {
    for (const file of PER_TICK_FILES) {
      const code = withoutComments(readFileSync(join(APP_ROOT, file), "utf8"));
      expect(code).toMatch(/use[A-Z][A-Za-z]*Store\(\(/);
    }
  });
});
