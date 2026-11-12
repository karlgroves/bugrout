/**
 * Fly deploys — `setup-flyctl` must install a named flyctl version (#349).
 *
 * The action's `uses:` is SHA-pinned, but that pins the installer, not what it
 * installs: with no `version:` input it resolves
 * `api.fly.io/app/flyctl_releases/<platform>/<arch>/latest` and runs whatever
 * flyctl comes back — inside the only job that holds `FLY_API_TOKEN`. So the
 * deployed tool, unlike every other tool in these workflows, changed under the
 * repository without a commit.
 *
 * Read as text, as dast-zap-step.security.test.ts does: there is no YAML
 * parser among the root dependencies, and a step's keys all sit between its
 * own list item and the next one.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- every path is a
   workflow file listed from the repository's own .github/workflows directory;
   none comes from input. Same justification as the other workflow tests. */
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const WORKFLOWS = join(import.meta.dirname, "..", "..", ".github", "workflows");

interface FlyctlStep {
  /** Workflow file name, for messages. */
  file: string;
  /** 1-based line of the step's `- uses:`. */
  line: number;
  /** The step's text, from its `- uses:` to the next list item. */
  text: string;
}

/**
 * Every `setup-flyctl` step in the repository's workflows.
 *
 * @returns The steps found, with the file and line each starts on.
 */
function flyctlSteps(): FlyctlStep[] {
  const out: FlyctlStep[] = [];
  for (const file of readdirSync(WORKFLOWS).filter(
    (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
  )) {
    const lines = readFileSync(join(WORKFLOWS, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!/^\s*- uses:\s*superfly\/flyctl-actions\/setup-flyctl@/.test(line)) {
        return;
      }
      const body = [line];
      for (const next of lines.slice(i + 1)) {
        if (/^\s*- (name|uses|run):/.test(next)) break;
        body.push(next);
      }
      out.push({ file, line: i + 1, text: body.join("\n") });
    });
  }
  return out;
}

const steps = flyctlSteps();

describe("setup-flyctl installs a pinned flyctl", () => {
  it("finds the Fly deploy step", () => {
    assert.ok(
      steps.some((s) => s.file === "backend-deploy.yml"),
      "backend-deploy.yml has no setup-flyctl step",
    );
  });

  it("names an exact version, never latest", () => {
    const offenders = steps
      .filter(
        (s) => !/^\s*version:\s*["']?\d+\.\d+\.\d+["']?\s*$/m.test(s.text),
      )
      .map((s) => `${s.file}:${String(s.line)}`);
    assert.deepEqual(
      offenders,
      [],
      'give the step `with: version: "x.y.z"`; without it the action installs latest',
    );
  });
});
