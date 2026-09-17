#!/usr/bin/env node
/**
 * Run TruffleHog and report findings without printing the secret.
 *
 * `pnpm run security:secrets`, the pre-commit hook and the Secret scan step in
 * .github/workflows/ci.yml all call this, so none of them can disagree about
 * what is scanned or what counts as a failure.
 *
 * Usage:
 *   node security/scripts/trufflehog.mjs            # full history (the gate)
 *   node security/scripts/trufflehog.mjs --staged   # staged content only
 *   node security/scripts/trufflehog.mjs --print    # print the command, run nothing
 *
 * Why a wrapper rather than the bare CLI, which is how every other scanner here
 * is invoked:
 *
 * 1. **TruffleHog has no `--redact`.** gitleaks did, and it was used. Without
 *    it the tool prints `Raw: AKIA...` — the credential itself — into a CI log
 *    that is world-readable on a public repository, which turns a leak into a
 *    published leak at the exact moment someone is trying to contain it. This
 *    reads the JSON stream and prints the detector, the location and a hash,
 *    never `Raw` or `RawV2`.
 * 2. **It exits 183 on findings, not 1.** Any non-zero fails a shell hook or an
 *    npm script, so that works by accident today — but 183 is also what it
 *    returns for nothing else, and collapsing it to 1 here means a genuine
 *    crash (127, 2) stays distinguishable from a finding.
 * 3. **There is no staged-only mode.** `gitleaks protect --staged` scanned
 *    exactly what was about to be committed. The nearest equivalent is to
 *    materialise the staged blobs and scan those, which is what `--staged`
 *    does below.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

/** Flags every invocation shares, so local and CI cannot drift apart. */
const COMMON = [
  // Verification calls the provider to prove a credential is live. It is off
  // everywhere on purpose: it would send candidate secrets to third parties
  // from developers' machines, and it is the only thing that would make the
  // local and CI commands differ.
  "--no-verification",
  // Never phone home mid-hook; the version is pinned in CI and by brew locally.
  "--no-update",
  "--json",
  "--no-color",
  "--log-level=-1",
];

/**
 * List the paths staged for commit, excluding deletions.
 *
 * @returns Repository-relative paths.
 */
function stagedPaths() {
  const out = spawnSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACM", "-z"],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (out.status !== 0) {
    throw new Error(`git diff --cached failed: ${out.stderr}`);
  }
  return out.stdout.split("\0").filter(Boolean);
}

/**
 * Write the staged version of each path into a throwaway directory.
 *
 * The staged blob, not the working-tree file: a secret can be staged and then
 * edited out of the working copy, and it is the staged bytes that would land in
 * the commit.
 *
 * @param paths - Repository-relative paths to materialise.
 * @returns The directory containing them.
 */
function materialiseStaged(paths) {
  const dir = mkdtempSync(join(tmpdir(), "bugrout-staged-"));
  for (const path of paths) {
    const blob = spawnSync("git", ["show", `:${path}`], {
      cwd: ROOT,
      encoding: "buffer",
      maxBuffer: 256 * 1024 * 1024,
    });
    if (blob.status !== 0) continue; // unmerged or otherwise unreadable
    const dest = join(dir, path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, blob.stdout);
  }
  return dir;
}

/**
 * Turn one TruffleHog JSON result into a line that names the finding without
 * reproducing it.
 *
 * @param finding - One parsed result from the JSON stream.
 * @param stagedRoot - Temp directory to strip from paths, when scanning staged.
 * @returns A printable line.
 */
function describe(finding, stagedRoot) {
  const meta = finding.SourceMetadata?.Data ?? {};
  const source = meta.Git ?? meta.Filesystem ?? {};
  let where = source.file ?? "(unknown file)";
  if (stagedRoot && where.startsWith(stagedRoot)) {
    where = relative(stagedRoot, where);
  }
  if (source.line) where += `:${source.line}`;
  if (source.commit) where += ` @ ${String(source.commit).slice(0, 9)}`;

  // A hash, so two findings are distinguishable and a fix is checkable,
  // without the value ever reaching a terminal or a log.
  const raw = finding.RawV2 || finding.Raw || "";
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 12);

  return `  ${finding.DetectorName ?? "unknown"}  ${where}  [redacted, ${raw.length} chars, sha256:${digest}]`;
}

const staged = process.argv.includes("--staged");
let scanDir = null;

try {
  // Before anything is materialised, so --print works with nothing staged.
  if (process.argv.includes("--print")) {
    const shape = staged
      ? ["filesystem", "<staged-copy>", ...COMMON]
      : ["git", "file://.", ...COMMON];
    console.log(["trufflehog", ...shape].join(" "));
    process.exit(0);
  }

  let args;
  if (staged) {
    const paths = stagedPaths();
    if (paths.length === 0) {
      console.log("No staged changes to scan.");
      process.exit(0);
    }
    scanDir = materialiseStaged(paths);
    args = ["filesystem", scanDir, ...COMMON];
  } else {
    args = ["git", "file://.", ...COMMON];
  }

  const result = spawnSync("trufflehog", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

  if (result.error) {
    console.error(
      "trufflehog is not installed — run `bash scripts/bootstrap.sh` first.",
    );
    process.exit(127);
  }

  const findings = result.stdout
    .split("\n")
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // 183 is "found something". Anything else non-zero is the tool failing, and
  // that must not be reported as a clean scan.
  if (result.status !== 0 && result.status !== 183) {
    console.error(result.stderr.trim() || `trufflehog exited ${result.status}`);
    process.exit(result.status ?? 1);
  }

  if (findings.length === 0) {
    console.log(`No secrets found (${staged ? "staged" : "full history"}).`);
    process.exit(0);
  }

  console.error(`\n${findings.length} secret(s) detected — values withheld:\n`);
  for (const finding of findings) console.error(describe(finding, scanDir));
  console.error(
    "\nRotate the credential first, then remove it. A secret that reached a\n" +
      "commit is compromised even after the commit is rewritten.\n",
  );
  process.exit(1);
} finally {
  if (scanDir) rmSync(scanDir, { recursive: true, force: true });
}
