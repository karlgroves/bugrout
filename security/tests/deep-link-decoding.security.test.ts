/**
 * §10.4 — deep-link decoding regression tests.
 *
 * GHSA-vcc3-ghjq-m6fr: `decode-uri-component` <= 0.4.2 decodes malformed
 * percent-encoded input in super-linear time. It reaches the shipped app
 * through `query-string`, which `expo-router` and `@react-navigation/core`
 * both use to parse deep links and route parameters, so the input is
 * attacker-supplied on a path that ships.
 *
 * Two controls hold it closed, and each fails differently:
 *
 *   1. A bounded `pnpm.overrides` entry pins `decode-uri-component` to the
 *      first patched release, 0.5.0.
 *   2. A `pnpm` patch on `query-string@7.1.3` unwraps the interop, because
 *      0.5.0 is ESM-only and `query-string` is CommonJS.
 *
 * Removing (1) is caught by `pnpm audit` and `osv-scanner`. Removing (2) is
 * **not** — those stay green while every deep link throws
 * `decodeComponent is not a function` at runtime. That gap is why this file
 * exists. See docs/dependency-upgrade-policy.md for the retirement condition.
 *
 * Both controls were mutation-tested, by removing each and reinstalling:
 *
 *   - patch removed  -> 6 of 48 red: the patch-hash check and every parse
 *     test, which throw `decodeComponent is not a function`. `stringify`
 *     stays green, correctly — it does not decode.
 *   - override removed -> 2 of 48 red: the version check, and the timing
 *     backstop at 63-76 s across runs, against its 2 s bound.
 *
 * Both files were restored byte-identical afterwards, and the battery was
 * re-run after the version check was rewritten to read the resolved path
 * instead of the manifest — the mechanism changed, so the earlier result no
 * longer vouched for it.
 *
 * These resolve `query-string` the way `expo-router` does rather than from
 * this file, so the test exercises the same copy the bundler ships — not a
 * hoisted one that might differ.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, test } from "node:test";

const requireFrom = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "../..");

/** Entry point of the `query-string` copy `expo-router` actually loads. */
const queryStringEntry = (() => {
  const routerDir = path.dirname(
    requireFrom.resolve("expo-router/package.json", {
      paths: [path.join(repoRoot, "apps/mobile")],
    }),
  );
  return requireFrom.resolve("query-string", { paths: [routerDir] });
})();

interface QueryString {
  parse: (input: string) => Record<string, unknown>;
  stringify: (
    input: Record<string, unknown>,
    options?: { sort?: boolean },
  ) => string;
}

const queryString = requireFrom(queryStringEntry) as QueryString;

/**
 * Version of the `decode-uri-component` that `query-string` loads.
 *
 * Read from the resolved path rather than the manifest. Its `exports` map does
 * not expose `./package.json`, and pnpm's isolated layout already encodes the
 * version in the store directory — which the patch-hash assertion below reads
 * the same way, so this adds no new assumption.
 *
 * @returns The version string, or null if the path is not in that layout.
 */
function resolvedDecodeUriComponentVersion(): string | null {
  const entry = requireFrom.resolve("decode-uri-component", {
    paths: [path.dirname(queryStringEntry)],
  });
  return /decode-uri-component@(\d+\.\d+\.\d+)/.exec(entry)?.[1] ?? null;
}

describe("deep-link decoding — the patched dependency is the one that ships", () => {
  // Structural, not timing-based: a version comparison cannot silently stop
  // detecting the way a wall-clock threshold can.
  test("decode-uri-component resolves to a patched release", () => {
    const version = resolvedDecodeUriComponentVersion();
    assert.ok(
      version,
      "could not read a decode-uri-component version from its resolved path",
    );
    const [major = 0, minor = 0] = version
      .split(".")
      .map((n) => Number.parseInt(n, 10));

    // 0.5.0 is the fix, and the package has never left 0.x — so on this line
    // "patched" is minor >= 5, and any 1.x would be patched by definition.
    assert.ok(
      major > 0 || minor >= 5,
      `decode-uri-component is ${version}; GHSA-vcc3-ghjq-m6fr needs >= 0.5.0. ` +
        `Check pnpm.overrides in package.json.`,
    );
  });

  test("query-string loads the patched copy, not an unpatched one", () => {
    assert.match(
      queryStringEntry,
      /query-string@[^/]*patch_hash=/,
      `expo-router resolved query-string to ${queryStringEntry}, which carries ` +
        `no patch hash. Check pnpm.patchedDependencies in package.json.`,
    );
  });
});

describe("deep-link decoding — parsing still works", () => {
  // Without the interop patch every one of these throws
  // "decodeComponent is not a function", which is the failure mode that no
  // scanner catches.
  // `parse` returns a null-prototype object, so each result is spread into a
  // plain one before comparing — otherwise the strict check fails on the
  // prototype while every value matches.
  test("a typical deep link parses", () => {
    assert.deepEqual(
      { ...queryString.parse("?dest=Safe%20Zone&lat=38.5") },
      {
        dest: "Safe Zone",
        lat: "38.5",
      },
    );
  });

  test("multibyte and escaped characters survive a round trip", () => {
    assert.deepEqual(
      { ...queryString.parse("?note=%E2%9C%93&city=caf%C3%A9") },
      {
        note: "✓",
        city: "café",
      },
    );
  });

  // `+` means space in a query string. query-string does that substitution
  // itself, before decoding — which is why the change in how
  // decode-uri-component treats `+` between 0.2.2 and 0.5.0 does not reach
  // here. Pinned because a future dependency swap could expose it.
  test("a plus sign still decodes to a space", () => {
    assert.deepEqual({ ...queryString.parse("?q=a+b") }, { q: "a b" });
    assert.deepEqual({ ...queryString.parse("?q=a%2Bb") }, { q: "a+b" });
  });

  test("stringify still works, as expo-router uses it", () => {
    assert.equal(
      queryString.stringify({ dest: "Safe Zone", lat: 38.5 }, { sort: false }),
      "dest=Safe%20Zone&lat=38.5",
    );
  });

  test("malformed input is returned rather than thrown", () => {
    assert.doesNotThrow(() => queryString.parse("?x=%FF&y=%2&z=%"));
  });
});

describe("deep-link decoding — the denial of service is closed", () => {
  // A backstop, not the primary detector: the version check above is what
  // actually holds this closed. The 2 s bound is unfalsifiable in both
  // directions, measured rather than guessed — reverting the override put this
  // at 63-76 s (>30,000x over), while the patched version takes 1-2 ms (~1000x
  // under), so no machine load can make it flaky and no vulnerable version can
  // sneak past it.
  test("a long malformed value decodes promptly", () => {
    const hostile = "?x=" + "%FF".repeat(2000);

    const started = process.hrtime.bigint();
    queryString.parse(hostile);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    assert.ok(
      elapsedMs < 2000,
      `decoding 2000 malformed sequences took ${elapsedMs.toFixed(1)}ms. ` +
        `A vulnerable decode-uri-component takes seconds on far less input.`,
    );
  });
});
