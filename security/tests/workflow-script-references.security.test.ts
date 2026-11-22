/**
 * Every `pnpm run <script>` a workflow or git hook names must exist.
 *
 * A workflow step that calls a deleted script fails the job with
 * `ERR_PNPM_NO_SCRIPT`, and nothing caught that before this test. Removing the
 * server code in #387 deleted `security:docker` from the root package.json but
 * left the step in `security.yml` that ran it; the local gate passed, because
 * `pnpm run check:all` reaches that script only through the `run-p` list it was
 * also removed from, and the workflow calls it as a step of its own. The
 * failure surfaced on the pull request.
 *
 * Nothing else looks at this. `actionlint` validates workflow syntax,
 * expressions, `needs`, matrices, runner labels and shellcheck over `run:`
 * blocks, but it cannot know which npm scripts exist. Knip reads the module
 * graph and the scripts' own contents, not the workflows that invoke them.
 * ESLint sees neither.
 *
 * Workflows and hooks are read as text, as `workflow-supply-chain` and
 * `dast-zap-step` do; there is no YAML parser among the root dependencies.
 *
 * A `working-directory:` in the same step changes which package.json `pnpm run`
 * resolves against, so a script is accepted if the root manifest or any
 * workspace manifest declares it. That is deliberately loose: the point is to
 * catch a name that exists nowhere, not to resolve every step's cwd.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- every path is
   either a workflow file listed from the repository's own .github/workflows
   directory, a hook listed from .husky, or a package.json named by
   pnpm-workspace.yaml. None comes from input. */
import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const WORKFLOWS = join(ROOT, ".github", "workflows");
const HUSKY = join(ROOT, ".husky");

interface Manifest {
  scripts?: Record<string, string>;
}

/**
 * Reads the script names a package.json declares.
 *
 * @param file - Absolute path to a package.json.
 * @returns Its script names, or an empty array if the file is absent.
 */
function scriptsIn(file: string): string[] {
  if (!existsSync(file)) return [];
  return Object.keys(
    (JSON.parse(readFileSync(file, "utf8")) as Manifest).scripts ?? {},
  );
}

/**
 * Every script name declared anywhere in the workspace.
 *
 * The workspace package list is read from pnpm-workspace.yaml's globs by their
 * leading directory, which is enough here: a glob's parent is a real directory
 * and each child holding a package.json is a workspace.
 */
const declaredScripts = new Set<string>([
  ...scriptsIn(join(ROOT, "package.json")),
  ...["apps", "packages"].flatMap((group) => {
    const dir = join(ROOT, group);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) =>
      scriptsIn(join(dir, name, "package.json")),
    );
  }),
  ...scriptsIn(join(ROOT, "security", "package.json")),
]);

/** Every file this test reads, as `{ label, source }`. */
const sources = [
  ...readdirSync(WORKFLOWS)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => ({
      label: join(".github", "workflows", f),
      source: readFileSync(join(WORKFLOWS, f), "utf8"),
    })),
  ...readdirSync(HUSKY)
    .filter((f) => !f.startsWith("_") && !f.startsWith("."))
    .map((f) => ({
      label: join(".husky", f),
      source: readFileSync(join(HUSKY, f), "utf8"),
    })),
];

describe("workflow and hook script references", () => {
  it("reads at least the workflows and hooks that exist", () => {
    // A glob that matches nothing would make every assertion below vacuous.
    assert.ok(
      sources.length >= 5,
      `expected several workflows and hooks, found ${String(sources.length)}`,
    );
  });

  for (const { label, source } of sources) {
    it(`names only scripts that exist (${label})`, () => {
      const referenced = [...source.matchAll(/pnpm run ([a-z0-9:_-]+)/g)].map(
        (m) => m[1],
      );
      const missing = referenced.filter(
        (name) => name !== undefined && !declaredScripts.has(name),
      );

      assert.deepEqual(
        missing,
        [],
        `${label} runs ${missing.join(", ")}, which no package.json declares`,
      );
    });
  }
});
