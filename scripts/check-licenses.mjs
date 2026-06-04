#!/usr/bin/env node
/**
 * License compliance gate for production dependencies.
 *
 * Uses `pnpm licenses list` (license-checker tools can't read pnpm's
 * node_modules layout — see docs/adr/0004). Fails if any production
 * dependency's license isn't covered by the allowlist. OR-expressions pass
 * when at least one alternative is allowed.
 */
import { execSync } from "node:child_process";

const ALLOWED = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "Apache 2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "CC0-1.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "Unlicense",
  "Python-2.0",
  "WTFPL",
  "BlueOak-1.0.0",
  "MPL-2.0", // file-level copyleft only; fine as an unmodified dependency
]);

/** Returns true when a license expression is satisfied by the allowlist. */
function isAllowed(expr) {
  if (ALLOWED.has(expr)) return true;
  const m = /^\((.+)\)$/.exec(expr.trim());
  const inner = m ? m[1] : expr;
  if (inner.includes(" OR ")) {
    return inner.split(" OR ").some((part) => ALLOWED.has(part.trim()));
  }
  if (inner.includes(" AND ")) {
    return inner.split(" AND ").every((part) => ALLOWED.has(part.trim()));
  }
  return false;
}

const raw = execSync("pnpm licenses list --prod --json", {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const byLicense = JSON.parse(raw);

let failures = 0;
for (const [license, packages] of Object.entries(byLicense)) {
  if (!isAllowed(license)) {
    failures += 1;
    const names = packages.map((p) => p.name).join(", ");
    console.error(`DISALLOWED license "${license}": ${names}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} disallowed license group(s) found.`);
  process.exit(1);
}
console.log(
  `License check passed (${Object.keys(byLicense).length} license groups, production deps).`,
);
