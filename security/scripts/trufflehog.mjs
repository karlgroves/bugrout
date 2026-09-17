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
 *
 * The exit code and the parse are cross-checked against each other, because a
 * wrapper that reads output is a new way for a scanner to fail silently. If
 * trufflehog says it found secrets and this cannot parse them, that is a
 * failure, not a clean scan. security/tests/secretScanner.security.test.ts
 * stubs the disagreement — it is unreachable while the tool behaves, so nothing
 * else would ever exercise it.
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
  // Exit 183 on findings. Without this the exit code is always 0 and the parse
  // below is the only signal there is — which is exactly the single point of
  // failure the cross-check at the bottom exists to remove.
  "--fail",
  // A scan that errors partway exits 0 by default, so a repository whose
  // history cannot be fully read would report clean forever.
  "--fail-on-scan-errors",
  "--json",
  "--no-color",
];

/** trufflehog's exit codes: clean, and "found something". */
const CLEAN = 0;
const FOUND = 183;

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
    // ENOENT is a missing binary. Anything else — ENOBUFS on a huge history,
    // EACCES — is a different problem and must not be reported as a missing
    // install, which would send someone to bootstrap.sh for no reason.
    if (result.error.code === "ENOENT") {
      console.error(
        "trufflehog is not installed — run `bash scripts/bootstrap.sh` first.",
      );
      process.exit(127);
    }
    console.error(`trufflehog could not be run: ${result.error.message}`);
    process.exit(1);
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

  // The exit code is trufflehog's verdict. The parse is only for presentation.
  // When they disagree, fail — a scanner that reports clean because its output
  // could not be read is worse than no scanner, because it also stops anyone
  // looking. This fires if the JSON shape changes, if a line is truncated, or
  // if the stream is ever something other than NDJSON.
  if (result.status === FOUND && findings.length === 0) {
    console.error(
      `trufflehog exited ${FOUND} (secrets found) but none of its output could\n` +
        "be parsed, so there is nothing to show you and nothing to trust. Treat\n" +
        "this as a finding until someone has looked. Run the command directly:\n" +
        `  node security/scripts/trufflehog.mjs${staged ? " --staged" : ""} --print\n`,
    );
    if (result.stderr.trim()) console.error(result.stderr.trim());
    process.exit(1);
  }

  // Anything non-zero that is not FOUND is the tool failing — a scan error
  // (--fail-on-scan-errors), a bad flag, a crash. Never a clean scan.
  if (result.status !== CLEAN && result.status !== FOUND) {
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
