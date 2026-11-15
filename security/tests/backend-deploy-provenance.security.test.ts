/**
 * Backend Deploy — only code that is on main can reach the deploy tokens.
 *
 * backend-deploy.yml runs on `workflow_run` after CI, which also fires for CI
 * runs on fork pull requests, and on `workflow_dispatch`, which skips the CI
 * and Security waits. It used to check out `workflow_run.head_sha` or the
 * dispatched ref with no provenance check of its own (#290): the only thing
 * keeping a fork PR's code away from the Cloudflare and Fly tokens was
 * actions/checkout's fork-PR refusal, and a dispatch of `refs/pull/N/head`
 * deployed with nothing checked.
 *
 * The gate's `if:` is asserted as text: GitHub evaluates it, and there is
 * nothing local to run. The "Require the commit to be on main" step is
 * extracted from the workflow as text, not a copy, and run under bash with a
 * stub `gh` on PATH standing in for the compare API, as
 * dast-zap-step.security.test.ts does for ZAP.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- this test writes
   an executable stub and the extracted step into a scratch directory and puts
   the stub on PATH, so writing to a computed path is the whole mechanism.
   Every path is built from mkdtempSync() under the OS temp directory and torn
   down in `after`; none comes from input. Same justification as
   dast-zap-step.security.test.ts. */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const WORKFLOW = readFileSync(
  join(ROOT, ".github", "workflows", "backend-deploy.yml"),
  "utf8",
);
const LINES = WORKFLOW.split("\n");
const STEP_NAME = "- name: Require the commit to be on main";

const tempDirs: string[] = [];

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * The lines of one job, from its `<name>:` key to the next job key.
 *
 * @param job - The job id under `jobs:`.
 * @returns The job's lines.
 */
function jobLines(job: string): string[] {
  const start = LINES.indexOf(`  ${job}:`);
  assert.ok(start >= 0, `backend-deploy.yml has no job "${job}"`);
  const end = LINES.findIndex((l, i) => i > start && /^ {2}[\w-]+:$/.test(l));
  return LINES.slice(start, end === -1 ? undefined : end);
}

/**
 * The gate job's `if:` condition, folded to one line.
 *
 * @returns The condition text, whitespace-normalised.
 */
function gateCondition(): string {
  const gate = jobLines("gate");
  const ifAt = gate.findIndex((l) => l.startsWith("    if:"));
  assert.ok(ifAt >= 0, "the gate job has no job-level `if:`");
  const parts = [(gate.at(ifAt) ?? "").replace(/^ {4}if:\s*(>-)?/, "")];
  for (const line of gate.slice(ifAt + 1)) {
    if (!line.startsWith("      ")) break;
    parts.push(line);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * The body of the provenance step's `run: |` block, de-indented.
 *
 * @returns The step's shell script.
 */
function extractStep(): string {
  const nameAt = LINES.findIndex((l) => l.trim() === STEP_NAME);
  assert.ok(nameAt >= 0, `backend-deploy.yml has no step "${STEP_NAME}"`);
  const runAt = LINES.findIndex((l, i) => i > nameAt && l.trim() === "run: |");
  assert.ok(runAt > nameAt, "the provenance step has no `run: |` block");
  const first = LINES[runAt + 1] ?? "";
  const indent = first.length - first.trimStart().length;
  const body: string[] = [];
  for (const line of LINES.slice(runAt + 1)) {
    if (line.trim() !== "" && line.length - line.trimStart().length < indent) {
      break;
    }
    body.push(line.trim() === "" ? "" : line.slice(indent));
  }
  return body.join("\n") + "\n";
}

/**
 * Stands in for `gh api repos/…/compare/…`: records its arguments, then
 * prints a compare status or fails as the API would for an unknown commit.
 */
const GH_STUB = `#!/bin/sh
printf '%s\\n' "$@" > "$STUB_ARGS"
if [ -n "$STUB_FAIL" ]; then
  echo 'gh: Not Found (HTTP 404)' >&2
  exit 1
fi
echo "$STUB_STATUS"
`;

interface StepRun {
  status: number | null;
  output: string;
  ghArgs: string[];
}

/**
 * Run the extracted step against the gh stub.
 *
 * @param compareStatus - What the compare API reports, or null for an error.
 * @returns The step's exit status, its output, and the stub's arguments.
 */
function runStep(compareStatus: string | null): StepRun {
  const dir = mkdtempSync(join(tmpdir(), "deploy-provenance-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, "gh"), GH_STUB);
  chmodSync(join(dir, "gh"), 0o755);
  const script = join(dir, "step.sh");
  writeFileSync(script, extractStep());
  const argsFile = join(dir, "gh-args");

  // bash -e, as GitHub runs a `run:` block with the default shell.
  const result = spawnSync("bash", ["-e", script], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      SHA: "0123456789abcdef0123456789abcdef01234567",
      REPO: "karlgroves/bugrout",
      STUB_STATUS: compareStatus ?? "",
      STUB_FAIL: compareStatus === null ? "1" : "",
      STUB_ARGS: argsFile,
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    ghArgs: existsSync(argsFile)
      ? readFileSync(argsFile, "utf8").split("\n").filter(Boolean)
      : [],
  };
}

describe("Backend Deploy — the gate ignores CI runs that were not a push here", () => {
  it("runs only for a dispatch, or a CI run on a push from this repository", () => {
    assert.equal(
      gateCondition(),
      "github.event_name == 'workflow_dispatch' || " +
        "(github.event.workflow_run.event == 'push' && " +
        "github.event.workflow_run.head_repository.full_name == github.repository)",
    );
  });

  it("puts both deploy jobs behind the gate", () => {
    for (const job of ["deploy-workers", "deploy-services"]) {
      assert.ok(
        jobLines(job).includes("    needs: gate"),
        `${job} does not need the gate, so the gate's guard does not cover it`,
      );
    }
  });
});

describe("Backend Deploy — only a commit on main can deploy", () => {
  it("applies on both paths, before the deploy decision", () => {
    const gate = jobLines("gate");
    const at = gate.findIndex((l) => l.trim() === STEP_NAME);
    const decideAt = gate.findIndex((l) => l.trim() === "id: decide");
    assert.ok(at >= 0, "the provenance step is not in the gate job");
    assert.ok(at < decideAt, "the provenance step runs after the decision");
    const step = gate.slice(at + 1, gate.indexOf("        run: |", at));
    assert.ok(
      !step.some((l) => l.trim().startsWith("if:")),
      "the provenance step is conditional; a dispatch could skip it",
    );
  });

  it("asks whether main contains the resolved commit", () => {
    const run = runStep("ahead");
    assert.equal(run.status, 0, run.output);
    assert.deepEqual(run.ghArgs.slice(0, 2), [
      "api",
      "repos/karlgroves/bugrout/compare/0123456789abcdef0123456789abcdef01234567...main",
    ]);
  });

  it("passes the tip of main (identical)", () => {
    const run = runStep("identical");
    assert.equal(run.status, 0, run.output);
  });

  for (const status of ["diverged", "behind", ""]) {
    it(`refuses a commit main does not contain (status '${status}')`, () => {
      const run = runStep(status);
      assert.notEqual(run.status, 0, run.output);
      assert.match(run.output, /not on main/);
    });
  }

  it("fails closed when the compare API errors", () => {
    const run = runStep(null);
    assert.notEqual(run.status, 0, run.output);
  });
});
