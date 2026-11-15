/**
 * A `pnpm.overrides` entry that matches nothing installed may not pass (#302).
 *
 * `markdown-it@>=14 <14.3.1` sat in package.json after the last markdown-it
 * 14.x left the tree. pnpm says nothing about that, so it read as protection
 * while protecting nothing. `check-overrides.mjs` reads the lockfile instead,
 * and this pins the rules it reads it by.
 *
 * Driven through the real script with `--package` / `--lockfile`, for the
 * reason `store-urls.security.test.ts` gives: the thing that must go red is
 * the command CI runs, exit code included.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const script = path.join(repoRoot, "security/scripts/check-overrides.mjs");

const workDir = mkdtempSync(path.join(tmpdir(), "bugrout-overrides-"));
after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** Writes a package.json and a lockfile whose `packages:` lists `installed`, then runs the script. */
function run(overrides: Record<string, string>, installed: string[]) {
  const dir = mkdtempSync(path.join(workDir, "case-"));
  const pkg = path.join(dir, "package.json");
  const lock = path.join(dir, "pnpm-lock.yaml");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- writes a fixture into this test's own mkdtemp directory
  writeFileSync(pkg, JSON.stringify({ pnpm: { overrides } }));
  const entries = installed
    .map((id) => (id.startsWith("@") ? `  '${id}':` : `  ${id}:`))
    .map((line) => `${line}\n    resolution: {integrity: sha512-x}\n`)
    .join("\n");
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- writes a fixture into this test's own mkdtemp directory
  writeFileSync(
    lock,
    `lockfileVersion: '9.0'\n\noverrides:\n  ignored@1.0.0: 9.9.9\n\npackages:\n\n${entries}\nsnapshots:\n\n  notapackage@1.0.0: {}\n`,
  );
  return spawnSync(
    process.execPath,
    [script, "--package", pkg, "--lockfile", lock],
    {
      encoding: "utf8",
    },
  );
}

describe("check-overrides.mjs", () => {
  test("passes the repository's own overrides against its own lockfile", () => {
    const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  });

  test("fails on the markdown-it entry that #302 found dead", () => {
    const r = run(
      {
        "markdown-it@>=14 <14.3.1": ">=14.3.1 <15",
        "markdown-it@>=15 <15.0.3": ">=15.0.3 <16",
      },
      ["markdown-it@15.0.3"],
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /dead override "markdown-it@>=14 <14\.3\.1"/);
    assert.doesNotMatch(r.stderr, /markdown-it@>=15/);
  });

  test("an entry is live when an installed version is in its replacement", () => {
    const r = run({ "node-forge@<1.4.3": ">=1.4.3 <2" }, ["node-forge@1.4.3"]);
    assert.equal(r.status, 0, r.stderr);
  });

  test("an entry is live when an installed version is still in its selector", () => {
    const r = run({ "glob@>=9 <14.0.2": ">=14.0.2 <15" }, ["glob@13.0.6"]);
    assert.equal(r.status, 0, r.stderr);
  });

  test("a package that has left the tree is dead", () => {
    const r = run({ "compression@>=1 <1.8.2": ">=1.8.2 <2" }, ["glob@14.0.3"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /none installed/);
  });

  test("reads scoped names, peer suffixes and parent>child keys", () => {
    const r = run(
      {
        "@xmldom/xmldom@<0.8.15": ">=0.8.15 <0.9",
        "@react-native/community-cli-plugin>metro": "0.83.8",
        "parent>child@>=2 <2.1.7": ">=2.1.7 <3",
      },
      [
        "@xmldom/xmldom@0.8.15",
        "metro@0.83.8(@babel/core@7.29.7)",
        "child@2.1.7",
      ],
    );
    assert.equal(r.status, 0, r.stderr);
  });

  test("a parent>child key whose child is at another version is dead", () => {
    const r = run({ "@react-native/community-cli-plugin>metro": "0.83.8" }, [
      "metro@0.83.3",
    ]);
    assert.equal(r.status, 1);
  });

  test("refuses range syntax it does not understand rather than guessing", () => {
    const r = run({ "uuid@^7": ">=11.1.1 <12" }, ["uuid@11.1.1"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unsupported version/);
  });

  // Prerelease precedence (#351). The comparator compared two prerelease
  // strings with a plain `<`, which reads `beta.10` as below `beta.2`. No
  // override uses a prerelease today, so these drive the rule directly.
  test("orders numeric prerelease identifiers numerically, not as text", () => {
    // beta.2 is below the beta.10 floor, so nothing installed is in range and
    // the entry is dead. Comparing as text put beta.2 above beta.10 and
    // reported this dead entry as live.
    const r = run({ "pkg@>=1.0.0-beta.10 <1.0.0": ">=1.0.0 <2" }, [
      "pkg@1.0.0-beta.2",
    ]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /dead override "pkg@>=1\.0\.0-beta\.10 <1\.0\.0"/);
  });

  test("keeps a live entry live when its prerelease is above the floor", () => {
    const r = run({ "pkg@>=1.0.0-beta.2 <1.0.0": ">=1.0.0 <2" }, [
      "pkg@1.0.0-beta.10",
    ]);
    assert.equal(r.status, 0, r.stderr);
  });

  test("sorts a prerelease below its own release and below a longer tag", () => {
    // 1.0.0-rc.1 < 1.0.0, so the selector still catches it; and
    // 1.0.0-alpha < 1.0.0-alpha.1, so the alpha.1 floor does not.
    const inRange = run({ "pkg@<1.0.0": ">=1.0.0 <2" }, ["pkg@1.0.0-rc.1"]);
    assert.equal(inRange.status, 0, inRange.stderr);
    const below = run({ "pkg@>=1.0.0-alpha.1 <1.0.0": ">=1.0.0 <2" }, [
      "pkg@1.0.0-alpha",
    ]);
    assert.equal(below.status, 1);
  });
});
