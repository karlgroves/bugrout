#!/usr/bin/env node
/**
 * Fail on a `pnpm.overrides` entry that matches nothing installed.
 *
 * pnpm reports an unused patch (`ERR_PNPM_UNUSED_PATCH`) and OSV-Scanner
 * reports an unused ignore, but an override that no longer matches any
 * installed package is silent: it still reads as protection in a diff while
 * protecting nothing. `markdown-it@>=14 <14.3.1` sat in package.json that way
 * after the last markdown-it 14.x left the tree (#302).
 *
 * An entry is live when at least one installed version of its package falls
 * inside its selector (it is still being rewritten) or inside its replacement
 * (it has been rewritten). An entry with neither is dead. A `parent>child` key
 * with no selector rewrites every copy it reaches, so it is live only when its
 * replacement is installed. Installed versions
 * come from the `packages:` section of pnpm-lock.yaml.
 *
 * Only the comparator syntax the overrides actually use is understood:
 * space-separated `<`, `<=`, `>`, `>=`, `=` or bare versions. Anything else
 * (`^`, `~`, `||`, `*`, tags) is an error rather than a guess, so a new entry
 * in an unfamiliar form fails loudly instead of passing unchecked.
 *
 * Usage: node security/scripts/check-overrides.mjs
 *          [--package package.json] [--lockfile pnpm-lock.yaml]
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");

/** "1.2.3" or "1.2.3-rc.1" -> [1, 2, 3, prerelease] ; partial "9" -> [9, 0, 0]. */
function parseVersion(text) {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(text);
  if (!m) throw new Error(`unsupported version "${text}"`);
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0), m[4] ?? ""];
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  if (a[3] === b[3]) return 0;
  if (a[3] === "") return 1;
  if (b[3] === "") return -1;
  return comparePrerelease(a[3], b[3]);
}

/**
 * SemVer precedence (spec rule 11) for two non-empty prerelease strings.
 *
 * Dot-separated identifiers compare one at a time: numeric ones numerically,
 * others in ASCII order, and a numeric identifier always sorts below a
 * non-numeric one. When every shared identifier ties, the longer list wins.
 * A plain `<` over the whole string instead read `beta.10` as below `beta.2`,
 * which can report a dead override as live (#351).
 */
function comparePrerelease(a, b) {
  const left = a.split(".");
  const right = b.split(".");
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i++) {
    const x = left[i];
    const y = right[i];
    if (x === y) continue;
    const xIsNumber = /^\d+$/.test(x);
    const yIsNumber = /^\d+$/.test(y);
    if (xIsNumber && yIsNumber) return Number(x) - Number(y);
    if (xIsNumber !== yIsNumber) return xIsNumber ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return left.length - right.length;
}

const OPS = {
  "<": (c) => c < 0,
  "<=": (c) => c <= 0,
  ">": (c) => c > 0,
  ">=": (c) => c >= 0,
  "=": (c) => c === 0,
};

/** Returns a predicate over version strings, or throws on unsupported syntax. */
function parseRange(range) {
  const parts = range.trim().split(/\s+/);
  const tests = parts.map((part) => {
    const m = /^(<=|>=|<|>|=)?(.+)$/.exec(part);
    const op = m[1] ?? "=";
    const bound = parseVersion(m[2]);
    return (v) => OPS[op](compare(v, bound));
  });
  return (version) => {
    const v = parseVersion(version);
    return tests.every((t) => t(v));
  };
}

/** "a>b@<2" -> { name: "b", selector: "<2" } ; "@s/x@1.0.0" -> { name: "@s/x", selector: "1.0.0" }. */
function parseKey(key) {
  // `>` separates parent from child only when a package name follows it; in a
  // range it is followed by `=` or a digit.
  const target = key.split(/(?<=[\w.-])>(?=[@a-z])/i).pop();
  const at = target.indexOf("@", target.startsWith("@") ? 1 : 0);
  if (at === -1) return { name: target, selector: null };
  return { name: target.slice(0, at), selector: target.slice(at + 1) };
}

/** Map of package name -> installed versions, from the lockfile's `packages:` section. */
function installedVersions(lockText) {
  const out = new Map();
  let inPackages = false;
  for (const line of lockText.split("\n")) {
    if (/^\S/.test(line)) {
      inPackages = line === "packages:";
      continue;
    }
    if (!inPackages) continue;
    const m = /^ {2}'?(@?[^@'\s]+)@([^('\s:]+)/.exec(line);
    if (!m) continue;
    if (!out.has(m[1])) out.set(m[1], new Set());
    out.get(m[1]).add(m[2]);
  }
  return out;
}

/** Returns the dead override keys, with what was installed for each. */
function findDeadOverrides(overrides, installed) {
  const dead = [];
  for (const [key, replacement] of Object.entries(overrides)) {
    const { name, selector } = parseKey(key);
    const versions = [...(installed.get(name) ?? [])];
    // With no selector the override applies to every copy it reaches, so a
    // live one always leaves its replacement installed.
    const inSelector = selector === null ? () => false : parseRange(selector);
    const inReplacement = parseRange(replacement);
    const live = versions.some((v) => inSelector(v) || inReplacement(v));
    if (!live) dead.push({ key, replacement, installed: versions });
  }
  return dead;
}

function main() {
  const { values } = parseArgs({
    options: {
      package: { type: "string", default: path.join(repoRoot, "package.json") },
      lockfile: {
        type: "string",
        default: path.join(repoRoot, "pnpm-lock.yaml"),
      },
    },
  });
  const overrides =
    JSON.parse(readFileSync(values.package, "utf8")).pnpm?.overrides ?? {};
  const installed = installedVersions(readFileSync(values.lockfile, "utf8"));

  let dead;
  try {
    dead = findDeadOverrides(overrides, installed);
  } catch (err) {
    console.error(`check-overrides: ${err.message}`);
    process.exit(2);
  }

  const total = Object.keys(overrides).length;
  if (dead.length === 0) {
    console.log(
      `check-overrides: all ${total} pnpm.overrides entries match an installed version`,
    );
    return;
  }
  for (const d of dead) {
    const seen = d.installed.length ? d.installed.join(", ") : "none installed";
    console.error(
      `check-overrides: dead override "${d.key}": "${d.replacement}" (installed: ${seen})`,
    );
  }
  console.error(
    `check-overrides: ${dead.length} of ${total} entries match nothing; delete them (docs/dependency-upgrade-policy.md)`,
  );
  process.exit(1);
}

main();
