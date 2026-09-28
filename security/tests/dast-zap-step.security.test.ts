/**
 * DAST — the "Run ZAP baseline" step must be able to fail.
 *
 * The first real DAST run passed while ZAP had crashed (#161): the container
 * could not write its report, `zap-baseline.py` exited 3, and the step only
 * failed on exit 1. The findings were lost and the green check said nothing.
 * The same step built a URL-exclusion list and never passed it to ZAP.
 *
 * These run the step's own script — extracted from `.github/workflows/dast.yml`
 * as text, not a copy — under bash, with a stub `docker` on PATH standing in
 * for the ZAP container. The stub exits with a chosen code, optionally writes
 * a report, and records the arguments it was given. So what is under test is
 * the step's decisions, not ZAP's: which outcomes fail the job, and what it
 * tells ZAP to exclude.
 *
 * ZAP's own behaviour was measured separately against the real image and is
 * recorded in the workflow's comments (exit 3 with EACCES on a runner-owned
 * checkout; exclusions at a shared index overwriting each other).
 */

/* eslint-disable security/detect-non-literal-fs-filename -- this test has to
   create an executable stub and put it on PATH, and write the extracted step
   and a scratch workspace for it to run in, so writing to a computed path is
   the whole mechanism. Every path is built from mkdtempSync() under the OS
   temp directory and torn down in `after`; none comes from input. Same
   justification as secretScanner.security.test.ts. */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * The body of the "Run ZAP baseline" step's `run: |` block, de-indented.
 *
 * @param workflow - The text of dast.yml.
 * @returns The step's shell script.
 */
function extractZapStep(workflow: string): string {
  const lines = workflow.split("\n");
  const nameAt = lines.findIndex(
    (l) => l.trim() === "- name: Run ZAP baseline",
  );
  assert.ok(nameAt >= 0, 'dast.yml has no step named "Run ZAP baseline"');
  const runAt = lines.findIndex((l, i) => i > nameAt && l.trim() === "run: |");
  assert.ok(
    runAt > nameAt,
    'the "Run ZAP baseline" step has no `run: |` block',
  );
  const first = lines[runAt + 1] ?? "";
  const indent = first.length - first.trimStart().length;
  const body: string[] = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() !== "" && line.length - line.trimStart().length < indent) {
      break;
    }
    body.push(line.trim() === "" ? "" : line.slice(indent));
  }
  return body.join("\n") + "\n";
}

const STEP = extractZapStep(
  readFileSync(join(ROOT, ".github", "workflows", "dast.yml"), "utf8"),
);

/** Stands in for `docker run … zap-baseline.py …`. */
const DOCKER_STUB = `#!/bin/sh
printf '%s\\n' "$@" > "$STUB_ARGS"
if [ "$STUB_REPORT" = 1 ]; then
  echo '{"site":[]}' > reports/security/zap-report.json
fi
exit "$STUB_EXIT"
`;

interface StepRun {
  status: number | null;
  output: string;
  /** The arguments the step passed to `docker`, one per line. */
  dockerArgs: string[];
}

/**
 * Run the extracted step in a scratch workspace against the docker stub.
 *
 * @param zapExit - Exit code the stub returns, as zap-baseline.py would.
 * @param writesReport - Whether the stub writes zap-report.json.
 * @param exclusions - Contents of security/config/zap-exclusions.txt.
 * @returns The step's exit status, its output, and the stub's arguments.
 */
function runStep(
  zapExit: number,
  writesReport: boolean,
  exclusions = ".*/logout.*\n.*/delete.*\n",
): StepRun {
  const dir = mkdtempSync(join(tmpdir(), "dast-zap-step-"));
  tempDirs.push(dir);
  const bin = join(dir, "bin");
  const work = join(dir, "work");
  mkdirSync(bin);
  mkdirSync(join(work, "security", "config"), { recursive: true });
  writeFileSync(
    join(work, "security", "config", "zap-exclusions.txt"),
    exclusions,
  );
  writeFileSync(join(bin, "docker"), DOCKER_STUB);
  chmodSync(join(bin, "docker"), 0o755);
  const script = join(dir, "step.sh");
  writeFileSync(script, STEP);
  const argsFile = join(dir, "docker-args");

  // bash -e, as GitHub runs a `run:` block with the default shell.
  const result = spawnSync("bash", ["-e", script], {
    cwd: work,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      TARGET_URL: "https://example.invalid",
      STUB_EXIT: String(zapExit),
      STUB_REPORT: writesReport ? "1" : "0",
      STUB_ARGS: argsFile,
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    dockerArgs: existsSync(argsFile)
      ? readFileSync(argsFile, "utf8").split("\n").filter(Boolean)
      : [],
  };
}

describe("DAST ZAP step — a scan that did not complete cannot pass", () => {
  it("fails when ZAP errors (exit 3) — the #161 false pass", () => {
    const run = runStep(3, false);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /ZAP did not complete \(exit 3\)/);
  });

  it("fails when ZAP exits 0 but wrote no report", () => {
    const run = runStep(0, false);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /wrote no reports\/security\/zap-report\.json/);
  });

  it("fails on FAIL-level findings (exit 1)", () => {
    const run = runStep(1, true);
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /high-confidence high-risk findings/);
  });

  it("passes on WARN-level findings (exit 2) with a report — they warn, not block", () => {
    assert.equal(runStep(2, true).status, 0);
  });

  it("passes a clean scan (exit 0) with a report", () => {
    assert.equal(runStep(0, true).status, 0);
  });
});

describe("DAST ZAP step — every exclusion reaches ZAP", () => {
  /**
   * The value the step passed to zap-baseline.py's -z option.
   *
   * @param run - A completed step run.
   * @returns The -z argument, or an empty string if none was passed.
   */
  function zOption(run: StepRun): string {
    const at = run.dockerArgs.indexOf("-z");
    return at >= 0 ? (run.dockerArgs[at + 1] ?? "") : "";
  }

  it("gives each pattern its own index, so none overwrites another", () => {
    const run = runStep(0, true, ".*/a.*\n# a comment\n\n.*/b.*\n.*/c.*\n");
    assert.equal(run.status, 0, run.output);
    const z = zOption(run);
    assert.match(z, /url\(0\)\.regex=\.\*\/a\.\*/);
    assert.match(z, /url\(1\)\.regex=\.\*\/b\.\*/);
    assert.match(z, /url\(2\)\.regex=\.\*\/c\.\*/);
    assert.match(z, /url\(2\)\.enabled=true/);
    assert.doesNotMatch(
      z,
      /url\(3\)/,
      "comments and blank lines are not patterns",
    );
    assert.match(run.output, /Excluding 3 URL pattern\(s\)/);
  });

  it("keeps a final pattern that has no trailing newline", () => {
    const run = runStep(0, true, ".*/a.*\n.*/b.*");
    assert.match(zOption(run), /url\(1\)\.regex=\.\*\/b\.\*/);
    assert.match(run.output, /Excluding 2 URL pattern\(s\)/);
  });

  it("rejects a pattern containing whitespace, which -z would split", () => {
    const run = runStep(0, true, ".*/a b.*\n");
    assert.equal(run.status, 1, run.output);
    assert.match(run.output, /ZAP exclusion contains whitespace/);
    assert.deepEqual(run.dockerArgs, [], "ZAP must not run at all");
  });

  it("reads the repository's real exclusion list", () => {
    const real = readFileSync(
      join(ROOT, "security", "config", "zap-exclusions.txt"),
      "utf8",
    );
    const patterns = real
      .split("\n")
      .filter((l) => l.trim() !== "" && !l.startsWith("#"));
    const run = runStep(0, true, real);
    assert.equal(run.status, 0, run.output);
    const last = `url(${String(patterns.length - 1)}).enabled=true`;
    assert.ok(
      zOption(run).includes(last),
      `expected the last of ${String(patterns.length)} patterns at ${last}`,
    );
    assert.ok(
      run.output.includes(
        `Excluding ${String(patterns.length)} URL pattern(s)`,
      ),
      run.output,
    );
  });
});
