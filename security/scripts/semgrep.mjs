#!/usr/bin/env node
/**
 * Run Semgrep from the single rule selection in security/config/semgrep.yml.
 *
 * Both `pnpm run security:semgrep` and the Scan step in
 * .github/workflows/security.yml call this, so the two cannot disagree about
 * which rules are in force.
 *
 * Usage:
 *   node security/scripts/semgrep.mjs              # gate, quiet
 *   node security/scripts/semgrep.mjs --sarif      # also write SARIF
 *   node security/scripts/semgrep.mjs --print      # print the command, run nothing
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const CONFIG = join(ROOT, "security", "config", "semgrep.yml");
const SARIF_OUT = join(ROOT, "reports", "security", "semgrep.sarif");

/**
 * Read the rule selection without a YAML dependency.
 *
 * The file is deliberately a flat list of scalars under three known keys, so a
 * few lines of parsing here buys the whole repository one fewer dependency —
 * and this script has to run before `pnpm install` in some CI shapes.
 *
 * @returns The parsed selection.
 */
function readSelection() {
  const text = readFileSync(CONFIG, "utf8");
  const configs = [];
  const excludeRules = [];
  const commonFlags = [];

  let section = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;

    const top = /^([a-zA-Z]+):\s*$/.exec(line);
    if (top) {
      section = top[1];
      continue;
    }

    const item = /^\s*-\s+(.*)$/.exec(line);
    if (!item) continue;
    const value = item[1].trim();

    if (section === "configs") configs.push(value);
    else if (section === "commonFlags") commonFlags.push(value);
    else if (section === "excludeRules") {
      const rule = /^rule:\s*(\S+)$/.exec(value);
      if (rule) excludeRules.push(rule[1]);
    }
  }

  if (configs.length === 0) {
    throw new Error(`No configs found in ${CONFIG}`);
  }
  return { configs, excludeRules, commonFlags };
}

const { configs, excludeRules, commonFlags } = readSelection();
const wantSarif = process.argv.includes("--sarif");

const args = ["scan"];
for (const config of configs) args.push("--config", config);
for (const rule of excludeRules) args.push(`--exclude-rule=${rule}`);
args.push(...commonFlags);

if (wantSarif) {
  mkdirSync(dirname(SARIF_OUT), { recursive: true });
  args.push("--sarif", "--output", SARIF_OUT);
} else {
  args.push("--quiet");
}

if (process.argv.includes("--print")) {
  console.log(["semgrep", ...args].join(" "));
  process.exit(0);
}

const result = spawnSync("semgrep", args, { stdio: "inherit", cwd: ROOT });
if (result.error) {
  console.error(
    "semgrep is not installed — run `bash scripts/bootstrap.sh` first.",
  );
  process.exit(127);
}
process.exit(result.status ?? 1);
