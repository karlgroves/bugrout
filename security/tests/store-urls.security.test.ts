/**
 * A store listing may not point at a page that does not exist (#249).
 *
 * `apps/mobile/fastlane/metadata/en-US/privacy_url.txt` is the privacy policy
 * URL submitted to App Store Connect. It answers **HTTP 200** with 114 bytes
 * of parked-domain stub — a `<script>` that bounces the browser to `/lander` —
 * and so does `support_url.txt`, which is also the contact URL the app
 * advertises to Nominatim and Overpass (`apps/mobile/utils/userAgent.ts`).
 *
 * The 200 is the whole problem: `lychee` resolves the link, `check-headers.js`
 * reads the headers, and both pass. `check-store-urls.mjs` reads the *content*
 * instead, and this pins the rules it reads it by.
 *
 * Driven through the real script with `--file`, rather than importing its
 * functions, for the reason `secretScanner.security.test.ts` spawns
 * `trufflehog.mjs`: the thing that must go red when a control is deleted is
 * the command the operator actually runs, exit code included.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const script = path.join(repoRoot, "security/scripts/check-store-urls.mjs");
const metadata = path.join(repoRoot, "apps/mobile/fastlane/metadata/en-US");

const workDir = mkdtempSync(path.join(tmpdir(), "bugrout-store-urls-"));
after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** The body `bugrout.app` served on 2026-10-23 and still on 2026-10-28, byte for byte. */
const PARKED_STUB =
  '<!DOCTYPE html><html><head><script>window.onload=function(){window.location.href="/lander"}</script></head></html>';

/** A page long enough to be real, worded as a privacy policy. */
const REAL_POLICY = `<html><body><h1>BugRout Privacy Policy</h1><p>${(
  "This policy explains what information BugRout collects, why it is " +
  "collected, and what leaves your device. BugRout has no account and no " +
  "advertising. Location data is sent to the routing service to plan a " +
  "route. Destination search text is sent to Nominatim to be turned into " +
  "coordinates. Crash reports are sent only after you turn them on. "
).repeat(3)}</p></body></html>`;

/** A page long enough to be real, worded as anything but a policy. */
const MARKETING_PAGE = `<html><body><h1>BugRout</h1><p>${(
  "Get out early and arrive safely. Download the maps for your state " +
  "before you need them, pick where you are going, and go. Works with no " +
  "signal. Available for iPhone and Android. Read the frequently asked " +
  "questions, or write to the team if something is not working for you. "
).repeat(3)}</p></body></html>`;

/**
 * Run the check against a body written to disk.
 *
 * @param name - File name to write it as.
 * @param body - The page body.
 * @param flags - Extra flags, e.g. `--no-policy`.
 * @returns The exit status and the combined output.
 */
function check(
  name: string,
  body: string,
  flags: string[] = [],
): { status: number; output: string } {
  const file = path.join(workDir, name);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- writes a fixture into this test's own mkdtemp directory; `name` is a literal at every call site
  writeFileSync(file, body);
  const run = spawnSync(process.execPath, [script, "--file", file, ...flags], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    status: run.status ?? -1,
    output: `${run.stdout}${run.stderr}`,
  };
}

describe("the parked stub that is live today", () => {
  test("is rejected, and named as a stub rather than as an empty page", () => {
    const { status, output } = check("parked.html", PARKED_STUB);

    assert.equal(status, 1, output);
    assert.match(output, /parked-domain stub/);
  });

  test("is rejected on its script body, not merely on its length", () => {
    // Stripping tags alone would score the stub's `<script>` contents as ~60
    // characters of "content". Padding the script past the length threshold
    // separates the two rules: this must still fail.
    const padded = PARKED_STUB.replace(
      "</script>",
      `/* ${"x".repeat(2000)} */</script>`,
    );
    const { status, output } = check("padded.html", padded);

    assert.equal(status, 1, output);
    assert.match(output, /parked-domain stub/);
  });

  test("is rejected when it redirects by meta refresh instead of script", () => {
    const { status, output } = check(
      "meta.html",
      '<html><head><meta http-equiv="refresh" content="0;url=/lander"></head></html>',
    );

    assert.equal(status, 1, output);
    assert.match(output, /parked-domain stub/);
  });
});

describe("a page that is served but says nothing", () => {
  test("is rejected for its readable length, with the number printed", () => {
    const { status, output } = check(
      "thin.html",
      "<html><body><h1>Privacy</h1><p>Coming soon.</p></body></html>",
    );

    assert.equal(status, 1, output);
    assert.match(output, /characters of readable text/);
  });
});

describe("policy wording", () => {
  test("a real policy passes", () => {
    const { status, output } = check("policy.html", REAL_POLICY);

    assert.equal(status, 0, output);
  });

  test("a long page that is not a policy fails where a policy is required", () => {
    const { status, output } = check("marketing.html", MARKETING_PAGE);

    assert.equal(status, 1, output);
    assert.match(output, /does not read as a privacy policy/);
  });

  test("the same page passes where only content is required", () => {
    const { status, output } = check("support.html", MARKETING_PAGE, [
      "--no-policy",
    ]);

    assert.equal(status, 0, output);
  });
});

describe("the submitted URLs", () => {
  test("are absolute https URLs, so there is something to check", () => {
    for (const file of ["privacy_url.txt", "support_url.txt"]) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads this repository's own metadata; `file` comes from the literal list above
      const url = readFileSync(path.join(metadata, file), "utf8").trim();
      assert.ok(
        url.startsWith("https://"),
        `${file} must hold an absolute https URL, got ${JSON.stringify(url)}`,
      );
      assert.doesNotThrow(() => new URL(url), `${file} is not a URL: ${url}`);
    }
  });
});
