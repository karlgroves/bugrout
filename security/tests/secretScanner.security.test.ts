/**
 * The secret scanner fails closed.
 *
 * Every other test of this wrapper is a happy path: plant a secret, watch it
 * get caught. That tells you nothing about the case that actually matters,
 * because the dangerous state is not "trufflehog missed a secret" — it is
 * "trufflehog found one and the wrapper said clean". The two only disagree when
 * the output cannot be parsed, which never happens while the tool is behaving,
 * which is why the review that caught it had to stub the tool rather than run
 * it.
 *
 * It was a real defect, not a hypothetical: the wrapper reported
 * "No secrets found" and exited 0 against a trufflehog exiting 183. It had also
 * never passed `--fail`, so the exit code was always 0 and the JSON parse was
 * the only signal in the system.
 *
 * These stub trufflehog on PATH so the wrapper's own decisions are what is
 * under test, not the detectors'.
 */

/* eslint-disable security/detect-non-literal-fs-filename -- this test has to
   create an executable stub and put it on PATH, so writing to a computed path
   is the whole mechanism. Every path is built from mkdtempSync() under the OS
   temp directory and torn down in `after`; none comes from input. Same
   justification as the source-walking tests in apps/mobile/__tests__. */
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const WRAPPER = join(ROOT, "security", "scripts", "trufflehog.mjs");

const stubDirs: string[] = [];

after(() => {
  for (const dir of stubDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * Run the wrapper against a stubbed trufflehog.
 *
 * @param script - Shell body for the stub, minus the shebang.
 * @returns The wrapper's exit status and streams.
 */
function runWithStub(script: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "bugrout-thstub-"));
  stubDirs.push(dir);
  const stub = join(dir, "trufflehog");
  writeFileSync(stub, `#!/bin/sh\n${script}\n`);
  chmodSync(stub, 0o755);

  const result = spawnSync(process.execPath, [WRAPPER], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** A syntactically valid finding, with a value that must never be printed. */
const SECRET = "AKIAZZZZTESTONLYZZZZ";
const FINDING = JSON.stringify({
  SourceMetadata: { Data: { Git: { file: "deploy.env", line: 3 } } },
  DetectorName: "AWS",
  Raw: SECRET,
  RawV2: `${SECRET}:abcdef`,
  Verified: false,
});

describe("secret scanner fails closed", () => {
  it("fails when trufflehog reports findings it cannot parse", () => {
    // The defect this file exists for. 183 means "secrets found"; producing no
    // parseable output must never be read as a clean scan.
    const run = runWithStub("exit 183");
    assert.notEqual(run.status, 0, "exited 0 despite trufflehog exiting 183");
    // Matched loosely on purpose: the point is that it says 183 and says the
    // output was unreadable, not the exact wording of the sentence.
    assert.match(run.stderr, /183/);
    assert.match(run.stderr, /parsed/);
  });

  it("fails when the JSON shape changes out from under it", () => {
    // The realistic form of the same thing: output arrives, but not as the
    // NDJSON the parser expects.
    const run = runWithStub('echo "<xml>findings</xml>"\nexit 183');
    assert.notEqual(run.status, 0, "exited 0 on unparseable findings");
  });

  it("fails, and shows why, when the scan errors", () => {
    // --fail-on-scan-errors makes this non-zero. A partially-readable history
    // must not report clean.
    const run = runWithStub(
      'echo "ERROR: failed to scan chunk: permission denied" >&2\nexit 2',
    );
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /permission denied/, "swallowed the diagnostic");
  });

  it("reports a parsed finding without printing the secret", () => {
    const run = runWithStub(`cat <<'JSON'\n${FINDING}\nJSON\nexit 183`);
    assert.equal(run.status, 1);
    const output = run.stdout + run.stderr;
    assert.ok(!output.includes(SECRET), "printed the credential");
    assert.match(output, /AWS/);
    assert.match(output, /deploy\.env:3/);
    assert.match(output, /redacted/);
  });

  it("passes only on a genuinely clean scan", () => {
    const run = runWithStub("exit 0");
    assert.equal(run.status, 0);
    assert.match(run.stdout, /No secrets found/);
  });

  it("distinguishes a missing binary from a broken one", () => {
    // ENOENT sends people to bootstrap.sh; nothing else should.
    const dir = mkdtempSync(join(tmpdir(), "bugrout-thempty-"));
    stubDirs.push(dir);
    const result = spawnSync(process.execPath, [WRAPPER], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, PATH: dir },
    });
    assert.equal(result.status, 127);
    assert.match(result.stderr, /not installed/);
  });

  it("asks trufflehog for the exit code it relies on", () => {
    // --fail is what makes 183 reachable. Without it the cross-check above is
    // unreachable code and the parse is the only signal again.
    const printed = spawnSync(process.execPath, [WRAPPER, "--print"], {
      cwd: ROOT,
      encoding: "utf8",
    }).stdout;
    // Exact tokens, not a regex. /--fail\b/ matches inside
    // "--fail-on-scan-errors" — "-" is a word boundary — so the obvious
    // assertion passes with --fail removed, which is the defect it is meant to
    // catch. Found by mutating the wrapper and watching this stay green.
    const args = printed.trim().split(/\s+/);
    assert.ok(args.includes("--fail"), `--fail missing from: ${printed}`);
    assert.ok(args.includes("--fail-on-scan-errors"));
    assert.ok(args.includes("--no-verification"));
  });
});

/**
 * Environment for a git fixture: everything but `GIT_*`.
 *
 * pre-push runs this suite with git's `GIT_DIR` and friends exported, and a
 * fixture that inherits them acts on the real repository instead of its temp
 * directory. The identity is passed here too, so nothing writes a git config.
 *
 * @returns The scrubbed environment.
 */
function fixtureEnv(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  return {
    ...env,
    GIT_AUTHOR_NAME: "fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  };
}

/**
 * Run git in a fixture directory and fail the test if it fails.
 *
 * @param cwd - Fixture directory.
 * @param args - git arguments.
 * @returns git's trimmed stdout.
 */
function git(cwd: string, args: string[]): string {
  const out = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: fixtureEnv(),
  });
  assert.equal(out.status, 0, `git ${args.join(" ")}: ${out.stderr}`);
  return out.stdout.trim();
}

describe("secret scanner target", () => {
  it("scans the main work tree when run from a linked worktree", () => {
    // `file://.` was the target. In a linked worktree `.git` is a pointer
    // file that trufflehog cannot open, so the full-history gate failed in
    // every worktree, and pre-push could not pass from one. The main checkout
    // cannot show this — there `.` is the right answer — hence the fixture.
    const base = realpathSync(mkdtempSync(join(tmpdir(), "bugrout-thwt-")));
    stubDirs.push(base);
    const main = join(base, "main");
    const linked = join(base, "linked");
    mkdirSync(main);
    git(main, ["init", "--quiet"]);
    // Plumbing, so no hook of any kind runs in the fixture.
    const tree = git(main, ["write-tree"]);
    const commit = git(main, ["commit-tree", tree, "-m", "init"]);
    git(main, ["update-ref", "refs/heads/fixture", commit]);
    git(main, ["worktree", "add", "--quiet", linked, "fixture"]);

    // The wrapper resolves everything from its own location, so a copy inside
    // the linked worktree behaves exactly as the real one does in ours.
    const wrapper = join(linked, "security", "scripts", "trufflehog.mjs");
    mkdirSync(dirname(wrapper), { recursive: true });
    copyFileSync(WRAPPER, wrapper);

    const stubDir = join(base, "bin");
    const seen = join(base, "target.txt");
    mkdirSync(stubDir);
    writeFileSync(
      join(stubDir, "trufflehog"),
      `#!/bin/sh\nprintf '%s' "$2" > '${seen}'\nexit 0\n`,
    );
    chmodSync(join(stubDir, "trufflehog"), 0o755);

    const run = spawnSync(process.execPath, [wrapper], {
      cwd: linked,
      encoding: "utf8",
      env: { ...fixtureEnv(), PATH: `${stubDir}:${process.env.PATH ?? ""}` },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(readFileSync(seen, "utf8"), `file://${main}`);
  });
});
