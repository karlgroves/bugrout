/**
 * The connectivity subscription stays mounted at the root.
 *
 * Third instance of the same failure: a module that is correct, tested, and
 * reachable from nothing. `useConnectivityTracking` is the only writer of
 * useConnectivityStore, and no screen mounted it — so the always-visible
 * online/offline badge read "Live" whatever the network was doing, and
 * useDataSync's came-online refresh never fired. Every unit test stayed green,
 * because each half worked; only the wiring was missing. #134 found it with
 * knip, which reported the hook and platform/network.ts as unreachable files.
 *
 * The first two instances are recorded next door: ScreenTitle's wrapper
 * (screenTitleCoverage.test.ts — "unwrapping a screen's default export left
 * all 224 tests green") and Sentry's `beforeSend` in #86. Both got a
 * source-level guard, and this is the third, for the same reason: the property
 * is itself source-level — "the root layout calls this" — and rendering
 * RootLayout to assert it would pull in expo-router, SplashScreen, fonts and
 * the whole bootstrap for no additional signal.
 *
 * Comments are stripped before matching, so commenting the call out fails here
 * rather than passing as a string match.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- this test walks
   app/ and reads what it finds; every path is derived from __dirname and a
   directory listing, never from input. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.join(__dirname, "..", "..", "app");
const HOOK_FILE = path.join(
  __dirname,
  "..",
  "..",
  "hooks",
  "useConnectivityTracking.ts",
);
const HOOK = "useConnectivityTracking";

/**
 * Remove block and line comments so a commented-out call cannot satisfy a
 * match. Crude by design — it does not parse strings, and nothing here needs
 * it to.
 *
 * @param source - File contents.
 * @returns The source with comments blanked out.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * Every .tsx file under app/.
 *
 * @param dir - Directory to walk.
 * @returns Absolute paths.
 */
function appFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...appFiles(full));
      continue;
    }
    if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("connectivity tracking is mounted", () => {
  const files = appFiles(APP_DIR);

  it("finds the app's screens at all", () => {
    // Guards the walker: a listing that silently matched nothing would make
    // every assertion below vacuously true.
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("still has a hook to mount", () => {
    // A rename that updated the hook but not its caller would otherwise show up
    // only as a typecheck error, and this test would go quietly vacuous.
    expect(stripComments(readFileSync(HOOK_FILE, "utf8"))).toContain(
      `export function ${HOOK}(`,
    );
  });

  it("is called by the root layout", () => {
    const layout = path.join(APP_DIR, "_layout.tsx");
    const source = stripComments(readFileSync(layout, "utf8"));

    expect(source).toContain(`import { ${HOOK} } from`);
    // The call, not just the import: importing without calling is precisely the
    // shape of the bug this guards.
    expect(source).toMatch(new RegExp(`\\b${HOOK}\\s*\\(\\s*\\)`));
  });

  it("is called from the root and nowhere else", () => {
    // Mounting it on a screen instead would track connectivity only while that
    // screen happened to be on top, which is the same defect wearing a
    // different shape — the store is global and the badge is on every screen.
    const callers = files.filter((file) =>
      new RegExp(`\\b${HOOK}\\s*\\(\\s*\\)`).test(
        stripComments(readFileSync(file, "utf8")),
      ),
    );

    expect(callers.map((f) => path.relative(APP_DIR, f))).toEqual([
      "_layout.tsx",
    ]);
  });
});
