#!/usr/bin/env node
/**
 * §21 — assemble security-summary.{md,json} from whatever scanner output is
 * present in reports/security/.
 *
 * Deliberately tolerant of missing inputs. A CI run where one scanner did not
 * execute should still produce a summary that says so, rather than crashing
 * and leaving the artifact with no summary at all — "OSV-Scanner: not run" is
 * information; a missing file is not.
 *
 * Usage:
 *   node security/scripts/generate-security-report.mjs [--target <url>]
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const REPORT_DIR = join(ROOT, "reports", "security");

const SEVERITIES = ["critical", "high", "medium", "low"];

/**
 * Read and parse a JSON report, returning null when absent or unreadable.
 *
 * @param {string} name - File name inside reports/security.
 * @returns {unknown|null} Parsed content, or null.
 */
function readReport(name) {
  const path = join(REPORT_DIR, name);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Run a command and return its trimmed stdout, or "not installed".
 *
 * @param {string} cmd - Executable.
 * @param {string[]} args - Arguments.
 * @returns {string} First line of output, or a placeholder.
 */
function version(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")[0]
      .trim();
  } catch {
    return "not installed";
  }
}

/**
 * Git metadata for the commit under scan.
 *
 * @returns {{sha: string, branch: string}} Commit SHA and branch.
 */
function gitInfo() {
  const read = (args) => {
    try {
      return execFileSync("git", args, { encoding: "utf8", cwd: ROOT }).trim();
    } catch {
      return "unknown";
    }
  };
  return {
    sha: process.env.GITHUB_SHA ?? read(["rev-parse", "HEAD"]),
    branch:
      process.env.GITHUB_REF_NAME ??
      read(["rev-parse", "--abbrev-ref", "HEAD"]),
  };
}

/** An empty severity tally. */
const emptyCounts = () => Object.fromEntries(SEVERITIES.map((s) => [s, 0]));

/**
 * Tally Semgrep SARIF findings by severity.
 *
 * @returns {{ran: boolean, counts: Record<string, number>}} Tally.
 */
function semgrepFindings() {
  const sarif = readReport("semgrep.sarif");
  if (!sarif) return { ran: false, counts: emptyCounts() };

  const counts = emptyCounts();
  const levelToSeverity = {
    error: "high",
    warning: "medium",
    note: "low",
    none: "low",
  };
  for (const run of sarif.runs ?? []) {
    for (const result of run.results ?? []) {
      const severity = levelToSeverity[result.level ?? "warning"] ?? "medium";
      counts[severity] += 1;
    }
  }
  return { ran: true, counts };
}

/**
 * Tally Trivy findings from the named reports.
 *
 * Split by report rather than merged: `trivy fs` reads dependency manifests
 * and belongs under dependencies, while `trivy config` and `trivy image` are
 * IaC and container findings. Merging them would file a lockfile CVE as a
 * container finding and apply the wrong threshold to it.
 *
 * @param {string[]} names - Report file names to read.
 * @returns {{ran: boolean, counts: Record<string, number>}} Tally.
 */
function trivyFindings(names) {
  const counts = emptyCounts();
  let ran = false;
  for (const name of names) {
    const report = readReport(name);
    if (!report) continue;
    ran = true;
    for (const result of report.Results ?? []) {
      for (const item of [
        ...(result.Vulnerabilities ?? []),
        ...(result.Misconfigurations ?? []),
        ...(result.Secrets ?? []),
      ]) {
        const severity = String(item.Severity ?? "LOW").toLowerCase();
        if (severity in counts) counts[severity] += 1;
      }
    }
  }
  return { ran, counts };
}

/**
 * Merge two tallies.
 *
 * @param {{ran: boolean, counts: Record<string, number>}} a - First tally.
 * @param {{ran: boolean, counts: Record<string, number>}} b - Second tally.
 * @returns {{ran: boolean, counts: Record<string, number>}} The merged tally.
 */
function merge(a, b) {
  const counts = emptyCounts();
  for (const severity of SEVERITIES) {
    counts[severity] = a.counts[severity] + b.counts[severity];
  }
  return { ran: a.ran || b.ran, counts };
}

/**
 * Tally OSV-Scanner findings. OSV does not carry a severity everywhere, so an
 * entry without one counts as high rather than being dropped.
 *
 * @returns {{ran: boolean, counts: Record<string, number>}} Tally.
 */
function osvFindings() {
  const report = readReport("osv-results.json");
  if (!report) return { ran: false, counts: emptyCounts() };
  const counts = emptyCounts();
  for (const result of report.results ?? []) {
    for (const pkg of result.packages ?? []) {
      for (const vuln of pkg.vulnerabilities ?? []) {
        const rating = (
          vuln.database_specific?.severity ?? "HIGH"
        ).toLowerCase();
        counts[rating in counts ? rating : "high"] += 1;
      }
    }
  }
  return { ran: true, counts };
}

/**
 * Tally Checkov failures. Checkov has no severity in the free tier, so every
 * failed check counts as medium and the count is reported separately.
 *
 * @returns {{ran: boolean, counts: Record<string, number>}} Tally.
 */
function checkovFindings() {
  const report = readReport("checkov.json");
  if (!report) return { ran: false, counts: emptyCounts() };
  const counts = emptyCounts();
  const runs = Array.isArray(report) ? report : [report];
  for (const run of runs) {
    counts.medium += (run.results?.failed_checks ?? []).length;
  }
  return { ran: true, counts };
}

/**
 * Read the exception register, reporting which entries have expired.
 *
 * @returns {{used: object[], expired: object[]}} Exception status.
 */
function exceptions() {
  const path = join(ROOT, "security", "config", "exceptions.json");
  if (!existsSync(path)) return { used: [], expired: [] };
  let entries;
  try {
    entries = JSON.parse(readFileSync(path, "utf8")).exceptions ?? [];
  } catch {
    return { used: [], expired: [] };
  }
  const today =
    process.env.SECURITY_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
  return {
    used: entries,
    expired: entries.filter((e) => String(e.expires ?? "") < today),
  };
}

const targetFlag = process.argv.indexOf("--target");
const target =
  (targetFlag !== -1 ? process.argv[targetFlag + 1] : undefined) ??
  process.env.SECURITY_TARGET_URL ??
  "not scanned (no DAST target for this run)";

const tools = [
  ["semgrep", version("semgrep", ["--version"])],
  ["osv-scanner", version("osv-scanner", ["--version"])],
  ["gitleaks", version("gitleaks", ["version"])],
  ["trivy", version("trivy", ["--version"])],
  ["hadolint", version("hadolint", ["--version"])],
  ["checkov", version("checkov", ["--version"])],
];

const sources = {
  sast: semgrepFindings(),
  dependencies: merge(osvFindings(), trivyFindings(["trivy-fs.json"])),
  containers: trivyFindings(["trivy-image.json"]),
  iac: merge(checkovFindings(), trivyFindings(["trivy-config.json"])),
};

const totals = emptyCounts();
for (const { counts } of Object.values(sources)) {
  for (const severity of SEVERITIES) totals[severity] += counts[severity];
}

const thresholds = JSON.parse(
  readFileSync(
    join(ROOT, "security", "config", "security-thresholds.json"),
    "utf8",
  ),
);

const blocking = [];
const warnings = [];
for (const [category, { ran, counts }] of Object.entries(sources)) {
  if (!ran) continue;
  for (const severity of SEVERITIES) {
    if (counts[severity] === 0) continue;
    const action = thresholds[category]?.[severity] ?? "warn";
    const line = `${category}: ${String(counts[severity])} ${severity}`;
    if (action === "fail") blocking.push(line);
    else if (action === "warn") warnings.push(line);
  }
}

const { used, expired } = exceptions();
const { sha, branch } = gitInfo();
const scanDate = process.env.SECURITY_REPORT_DATE ?? new Date().toISOString();

const nextActions = [];
if (blocking.length > 0) {
  nextActions.push("Resolve the blocking findings above before merging.");
}
if (expired.length > 0) {
  nextActions.push(
    `Renew or remove ${String(expired.length)} expired exception(s) in security/config/exceptions.json.`,
  );
}
for (const [category, { ran }] of Object.entries(sources)) {
  if (!ran)
    nextActions.push(`No ${category} report present — did that scanner run?`);
}
if (nextActions.length === 0) {
  nextActions.push(
    "Nothing blocking. Review the warnings above at your convenience.",
  );
}

const summary = {
  scanDate,
  commitSha: sha,
  branch,
  toolVersions: Object.fromEntries(tools),
  targetUrl: target,
  totalFindingsBySeverity: totals,
  findingsBySource: Object.fromEntries(
    Object.entries(sources).map(([k, v]) => [k, { ran: v.ran, ...v.counts }]),
  ),
  blockingFindings: blocking,
  warnings,
  exceptionsUsed: used,
  expiredExceptions: expired,
  recommendedNextActions: nextActions,
};

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(
  join(REPORT_DIR, "security-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);

const md = `# Security summary

| | |
| --- | --- |
| Scan date | ${scanDate} |
| Commit SHA | \`${sha}\` |
| Branch | \`${branch}\` |
| Target URL | ${target.startsWith("http") ? `<${target}>` : target} |

## Tool versions

${tools.map(([name, v]) => `- **${name}** — ${v}`).join("\n")}

## Total findings by severity

| Severity | Count |
| --- | --- |
${SEVERITIES.map((s) => `| ${s} | ${String(totals[s])} |`).join("\n")}

### By source

| Source | Ran | Critical | High | Medium | Low |
| --- | --- | --- | --- | --- | --- |
${Object.entries(sources)
  .map(
    ([name, v]) =>
      `| ${name} | ${v.ran ? "yes" : "**no**"} | ${String(v.counts.critical)} | ${String(v.counts.high)} | ${String(v.counts.medium)} | ${String(v.counts.low)} |`,
  )
  .join("\n")}

## Blocking findings

${blocking.length > 0 ? blocking.map((b) => `- ${b}`).join("\n") : "None."}

## Warnings

${warnings.length > 0 ? warnings.map((w) => `- ${w}`).join("\n") : "None."}

## Exceptions used

${used.length > 0 ? used.map((e) => `- \`${e.id}\` — ${e.reason} (expires ${e.expires})`).join("\n") : "None on file."}

## Expired exceptions

${expired.length > 0 ? expired.map((e) => `- \`${e.id}\` — expired ${e.expires}`).join("\n") : "None."}

## Recommended next actions

${nextActions.map((a) => `- ${a}`).join("\n")}
`;

writeFileSync(join(REPORT_DIR, "security-summary.md"), md);

console.log(
  `security-summary written — ${String(blocking.length)} blocking, ${String(warnings.length)} warnings`,
);
process.exit(0);
