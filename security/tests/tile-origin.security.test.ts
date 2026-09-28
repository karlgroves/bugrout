/**
 * The tile origin is one URL, written in several places. They must agree.
 *
 * `apps/mobile/eas.json` sets `EXPO_PUBLIC_TILE_SERVER_URL` for the builds
 * that ship; that is the origin the app calls. Four other places fall back to
 * a literal when the variable is unset — the app config, `TileManager`, the
 * EAS build workflow — and the DAST workflow scans a literal of its own.
 *
 * They drifted once. Every fallback and the DAST default named
 * `tiles.bugrout.app`, a hostname that has never resolved: every DAST run
 * failed before ZAP started, so no dynamic scan ever happened, and any build
 * that fell back — the simulator profile, a plain `expo start` — could not
 * download tiles (#158). Nothing reported the disagreement because each file
 * was internally consistent.
 *
 * This reads each literal out of its file as text, rather than importing, so
 * it checks what the build and the workflows will actually see. Each file is
 * read by a literal path, so every call site names the file it reads.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");

interface EasConfig {
  build: Record<string, { env?: Record<string, string> }>;
}

/** The origin the shipped app calls: the production profile's value. */
const shippedOrigin = (() => {
  const eas = JSON.parse(
    readFileSync(path.join(repoRoot, "apps/mobile/eas.json"), "utf8"),
  ) as EasConfig;
  const url = eas.build.production?.env?.EXPO_PUBLIC_TILE_SERVER_URL;
  assert.ok(
    url,
    "eas.json production profile sets no EXPO_PUBLIC_TILE_SERVER_URL",
  );
  return url;
})();

/**
 * Every place the origin is written as a literal, with the pattern that
 * captures it. Each pattern must match exactly once.
 */
const literals: readonly {
  where: string;
  file: string;
  source: string;
  pattern: RegExp;
}[] = [
  {
    where: "app config fallback",
    file: "apps/mobile/app.config.ts",
    source: readFileSync(
      path.join(repoRoot, "apps/mobile/app.config.ts"),
      "utf8",
    ),
    pattern: /EXPO_PUBLIC_TILE_SERVER_URL\s*\?\?\s*"([^"]+)"/g,
  },
  {
    where: "TileManager fallback",
    file: "apps/mobile/services/tiles/TileManager.ts",
    source: readFileSync(
      path.join(repoRoot, "apps/mobile/services/tiles/TileManager.ts"),
      "utf8",
    ),
    pattern: /EXPO_PUBLIC_TILE_SERVER_URL\s*\?\?\s*"([^"]+)"/g,
  },
  {
    where: "EAS build workflow fallback",
    file: ".github/workflows/eas-build.yml",
    source: readFileSync(
      path.join(repoRoot, ".github/workflows/eas-build.yml"),
      "utf8",
    ),
    pattern: /vars\.TILE_SERVER_URL\s*\|\|\s*'([^']+)'/g,
  },
  {
    where: "DAST dispatch input default",
    file: ".github/workflows/dast.yml",
    source: readFileSync(
      path.join(repoRoot, ".github/workflows/dast.yml"),
      "utf8",
    ),
    pattern: /^\s+default:\s*(\S+)\s*$/gm,
  },
  {
    where: "DAST resolved target fallback",
    file: ".github/workflows/dast.yml",
    source: readFileSync(
      path.join(repoRoot, ".github/workflows/dast.yml"),
      "utf8",
    ),
    pattern: /REQUESTED_TARGET:-([^}]+)\}/g,
  },
];

describe("tile origin — every literal matches the origin the app ships with", () => {
  test("the shipped origin is HTTPS", () => {
    assert.match(shippedOrigin, /^https:\/\//);
  });

  for (const { where, file, source, pattern } of literals) {
    test(`${where} (${file})`, () => {
      const found = [...source.matchAll(pattern)].map((m) => m[1]);
      assert.equal(
        found.length,
        1,
        `expected exactly one ${where} in ${file}, found ${String(found.length)}; ` +
          `if the file was restructured, update the pattern in this test.`,
      );
      assert.equal(
        found[0],
        shippedOrigin,
        `${where} in ${file} is ${String(found[0])}, but the app ships with ` +
          `${shippedOrigin} (apps/mobile/eas.json, production). A fallback or ` +
          `scan target that differs points at an origin the app never calls.`,
      );
    });
  }
});
