/**
 * Workflows — no expression is pasted into a shell, and no tool is installed
 * unpinned or unverified (#303).
 *
 * Semgrep's run-shell-injection rule tracks `github.event.*` into `run:`, but a
 * value that passes through a matrix loses that taint: `data-pipeline.yml` ran
 * `./build-region.sh ${{ matrix.region }}` where the matrix came from a
 * dispatch input, and Semgrep stayed green. So this checks the shape directly:
 * no `${{ }}` inside any `run:` script, whatever context it reads.
 *
 * The install checks hold every workflow to the control
 * docs/dependency-upgrade-policy.md ("Pinned scanner binaries") states for
 * trufflehog: a release download names its version and is checked with
 * `sha256sum` before it runs; package-manager installs name an exact version.
 *
 * Workflows are read as text, as dast-zap-step.security.test.ts does; there is
 * no YAML parser among the root dependencies, and `run:` blocks are found by
 * indentation, which is all YAML block scalars use.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- every path is a
   workflow file listed from the repository's own .github/workflows directory;
   none comes from input. */
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const WORKFLOWS = join(import.meta.dirname, "..", "..", ".github", "workflows");

interface Step {
  file: string;
  /** 1-based line of the step's `- name:` or first key. */
  line: number;
  text: string;
}

interface RunBlock {
  file: string;
  line: number;
  script: string;
}

const files = readdirSync(WORKFLOWS)
  .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
  .map((f) => ({ file: f, text: readFileSync(join(WORKFLOWS, f), "utf8") }));

/**
 * Leading spaces on a line.
 *
 * @param line - A line of YAML.
 * @returns The indentation width.
 */
function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Every `run:` script in a workflow: the inline value or the block scalar
 * under it.
 *
 * @param file - Workflow file name, for messages.
 * @param text - Workflow text.
 * @returns The scripts with the line each starts on.
 */
function runBlocks(file: string, text: string): RunBlock[] {
  const lines = text.split("\n");
  const out: RunBlock[] = [];
  lines.forEach((line, i) => {
    const m = /^(\s*)(- )?run:\s*(.*)$/.exec(line);
    if (!m) return;
    // The `run:` key's own column: under `- run:` it sits past the dash, so
    // the step's sibling keys (`env:`, `with:`) end the script, not join it.
    const keyIndent = (m[1] ?? "").length + (m[2] ?? "").length;
    const body = [m[3] ?? ""];
    for (const next of lines.slice(i + 1)) {
      if (next.trim() !== "" && indentOf(next) <= keyIndent) break;
      body.push(next);
    }
    out.push({ file, line: i + 1, script: body.join("\n") });
  });
  return out;
}

/**
 * Every step in a workflow, cut at each list item that opens one (`- name:`,
 * `- uses:` or `- run:`). Coarse, but a step's keys all sit between its opening
 * item and the next one, which is all the checks below need.
 *
 * @param file - Workflow file name, for messages.
 * @param text - Workflow text.
 * @returns The steps' text.
 */
function steps(file: string, text: string): Step[] {
  const out: Step[] = [];
  text.split("\n").forEach((line, i) => {
    if (/^\s*- (name|uses|run):/.test(line)) {
      out.push({ file, line: i + 1, text: line });
    } else {
      const last = out.at(-1);
      if (last) last.text += "\n" + line;
    }
  });
  return out;
}

const allRuns = files.flatMap(({ file, text }) => runBlocks(file, text));
const allSteps = files.flatMap(({ file, text }) => steps(file, text));

describe("workflow run: scripts", () => {
  it("finds the workflows and their run blocks", () => {
    assert.ok(files.length >= 5, "expected the repository's workflows");
    assert.ok(allRuns.length >= 20, "expected to find run: blocks");
    assert.ok(
      allRuns.some(
        (r) =>
          r.file === "data-pipeline.yml" &&
          r.script.includes("build-region.sh"),
      ),
      "data-pipeline.yml's build step was not found",
    );
  });

  it("never interpolate an expression; values go through env:", () => {
    // `github.sha` is a commit hash GitHub computes; nothing a dispatcher or
    // contributor types can reach it.
    const allowed = /\$\{\{\s*github\.sha\s*\}\}/g;
    const offenders = allRuns
      .filter((r) => r.script.replace(allowed, "").includes("${{"))
      .map((r) => `${r.file}:${r.line}`);
    assert.deepEqual(
      offenders,
      [],
      "route these through env: and quote the variable",
    );
  });
});

describe("tool installs in workflows", () => {
  it("download releases by version, never releases/latest", () => {
    const offenders = allSteps
      .filter((s) => /\/releases\/latest\b/.test(s.text))
      .map((s) => `${s.file}:${s.line}`);
    assert.deepEqual(offenders, []);
  });

  it("verify every downloaded release with sha256sum before it runs", () => {
    const downloads = allSteps.filter((s) =>
      s.text.includes("/releases/download/"),
    );
    assert.ok(downloads.length >= 5, "expected the scanner and tool downloads");
    const offenders = downloads
      .filter((s) => !/sha256sum (--check|-c)\b/.test(s.text))
      .map((s) => `${s.file}:${s.line}`);
    assert.deepEqual(offenders, []);
  });

  it("pin pipx installs to an exact version", () => {
    const offenders = allRuns
      .flatMap((r) =>
        [...r.script.matchAll(/pipx install\s+(\S+)/g)].map((m) => ({
          r,
          pkg: m[1] ?? "",
        })),
      )
      .filter(({ pkg }) => !/^[\w.-]+==\d[\w.]*$/.test(pkg))
      .map(({ r, pkg }) => `${r.file}:${r.line} ${pkg}`);
    assert.deepEqual(offenders, []);
  });

  it("pin global npm installs to an exact version", () => {
    const offenders = allRuns
      .flatMap((r) =>
        [...r.script.matchAll(/npm (?:install|i) -g\s+(\S+)/g)].map((m) => ({
          r,
          pkg: m[1] ?? "",
        })),
      )
      .filter(({ pkg }) => {
        const at = pkg.lastIndexOf("@");
        return at <= 0 || !/^\d+\.\d+\.\d+$/.test(pkg.slice(at + 1));
      })
      .map(({ r, pkg }) => `${r.file}:${r.line} ${pkg}`);
    assert.deepEqual(offenders, []);
  });

  it("pin the EAS CLI", () => {
    const offenders = files
      .filter(({ text }) => /eas-version:\s*["']?latest/.test(text))
      .map(({ file }) => file);
    assert.deepEqual(offenders, []);
  });
});
