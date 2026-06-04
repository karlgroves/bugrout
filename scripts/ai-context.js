#!/usr/bin/env node
/**
 * Prints a compact project-facts summary for priming AI coding sessions.
 * Usage: pnpm run ai:context
 */
const { readFileSync, readdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");

/** Reads and parses a JSON file relative to the repo root. */
function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

const pkg = readJson("package.json");

const workspaceDirs = [
  "apps/mobile",
  "packages/shared",
  "packages/elf-model",
  "backend/workers/tile-server",
  "backend/workers/alert-aggregator",
  "backend/workers/crowd-signal",
  "backend/services/route-tracker",
];

console.log(`# ${pkg.name} — project facts\n`);
console.log(
  `Node ${readFileSync(join(root, ".nvmrc"), "utf8").trim()}, ${pkg.packageManager}, Turborepo\n`,
);

console.log("## Workspaces");
for (const dir of workspaceDirs) {
  const p = readJson(join(dir, "package.json"));
  console.log(
    `- ${p.name} (${dir}): scripts: ${Object.keys(p.scripts ?? {}).join(", ")}`,
  );
}

console.log("\n## Root scripts");
for (const [name, cmd] of Object.entries(pkg.scripts)) {
  console.log(`- ${name}: ${cmd}`);
}

console.log("\n## Key facts");
console.log(
  "- Lint: single root eslint.config.mjs (strict type-checked; see docs/adr/0006)",
);
console.log(
  "- Types: tsconfig.base.json with noUncheckedIndexedAccess + exactOptionalPropertyTypes",
);
console.log(
  "- Tests: jest-expo (apps/mobile), Detox e2e; co-located __tests__/",
);
console.log("- Hooks: Husky pre-commit lint-staged+gitleaks, pre-push check");
console.log(
  "- Docs: CLAUDE.md (architecture), docs/adr/ (decisions), docs/tech-debt.md (ledger)",
);

const adrDir = join(root, "docs/adr");
if (existsSync(adrDir)) {
  console.log("\n## ADRs");
  for (const f of readdirSync(adrDir).sort()) {
    console.log(`- docs/adr/${f}`);
  }
}
