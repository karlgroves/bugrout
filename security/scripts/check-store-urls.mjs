#!/usr/bin/env node
/**
 * The URLs submitted to the stores have to serve what they claim (#249).
 *
 * `apps/mobile/fastlane/metadata/en-US/privacy_url.txt` is the privacy policy
 * URL given to App Store Connect. Apple fetches and reads that page during
 * review. On 2026-10-23 and still on 2026-10-28 it answered **HTTP 200** with
 * a 114-byte body:
 *
 *   <!DOCTYPE html><html><head><script>window.onload=function(){
 *   window.location.href="/lander"}</script></head></html>
 *
 * A parked-domain stub. It renders nothing, states no policy, and bounces the
 * browser to a lander that has none either.
 *
 * **200 is why nothing caught it.** Every check this repository already had
 * reads a status code: `lychee` in `docs.yml` resolves links, `check-headers.js`
 * asserts response headers. Both pass on that body. The one check that reads
 * the policy's *content* — `apps/mobile/__tests__/docs/privacyLabelDrift.test.ts`
 * — cross-checks the bundled policy and both store labels against the source,
 * and says so in its own header: "not caught — whether the *hosted* policy at
 * bugrout.app/privacy agrees. That page is deployed, not in this repository,
 * so #206's third artifact can only be checked by hand."
 *
 * This is that check, so it is no longer by hand. The page cannot be *fixed*
 * from here — `bugrout.app` is hosted, not in this repository, which is why
 * #249 stays open — but a submission blocker that answers 200 should not be
 * invisible to the repository that submits it.
 *
 * Deliberately **not** in `pnpm run check` or `pnpm run security`. It calls a
 * third-party host over the network, so it would make every pull request
 * depend on a site being up, and it is red today for a reason outside any
 * branch. It is a pre-submission check, run the way `security:headers` is:
 *
 *   pnpm run security:store-urls
 *   node security/scripts/check-store-urls.mjs <url> ...
 *   node security/scripts/check-store-urls.mjs --file <saved-body.html>
 *
 * A URL or file named on the command line is judged as a privacy policy;
 * `--no-policy` asks only for readable content, as the support URL does.
 *
 * Exit codes, matching check-headers.js:
 *   0  every submitted URL serves real content
 *   1  at least one serves no readable content, or no policy
 *   2  at least one could not be reached
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const METADATA = join(ROOT, "apps", "mobile", "fastlane", "metadata", "en-US");

/**
 * Shortest run of readable text that counts as a published page.
 *
 * The parked stub yields zero characters; the bundled policy in
 * `constants/legal.ts` is several thousand. 400 sits far from both, so this
 * distinguishes "nothing is there" from "a page is there" without becoming an
 * opinion about how long a policy should be.
 */
const MIN_VISIBLE_TEXT = 400;

/** Words a page has to use to read as a privacy policy rather than a landing page. */
const POLICY_TERMS = [/\bcollect/i, /\binformation\b/i, /\bdata\b/i];

/** How long to wait on a host before calling it unreachable. */
const TIMEOUT_MS = 15000;

/**
 * The human-readable text of an HTML document.
 *
 * Scripts and styles are removed before tags, because their contents are text
 * nodes that would otherwise count: the parked stub is almost entirely a
 * `<script>` body, and stripping tags alone would score it as 60 characters of
 * "content".
 *
 * @param html - The response body.
 * @returns The visible text, with whitespace collapsed.
 */
export function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a body is a redirect shim: markup whose only job is to send the
 * browser somewhere else.
 *
 * Reported separately from "no readable content" because it is the specific
 * shape a parked domain takes, and naming it tells the reader what they are
 * looking at rather than leaving them to open the URL to find out.
 *
 * @param html - The response body.
 * @returns True when the body only redirects.
 */
export function isRedirectShim(html) {
  const redirects =
    /location\s*\.\s*(href|replace|assign)|<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(
      html,
    );
  return redirects && visibleText(html).length < MIN_VISIBLE_TEXT;
}

/**
 * Judge one fetched page.
 *
 * @param body - The response body as text.
 * @param options - `requirePolicy` additionally demands policy wording.
 * @returns `ok`, and when it is false the reason to print.
 */
export function classifyBody(body, { requirePolicy = false } = {}) {
  if (isRedirectShim(body)) {
    return {
      ok: false,
      reason:
        "serves a redirect shim with no content of its own — a parked-domain stub, not a page",
    };
  }

  const text = visibleText(body);
  if (text.length < MIN_VISIBLE_TEXT) {
    return {
      ok: false,
      reason: `serves only ${text.length} characters of readable text (need ${MIN_VISIBLE_TEXT})`,
    };
  }

  if (requirePolicy) {
    const missing = !/\bprivacy\b/i.test(text);
    const unsupported = !POLICY_TERMS.some((term) => term.test(text));
    if (missing || unsupported) {
      return {
        ok: false,
        reason:
          "has readable content but does not read as a privacy policy (no statement about what is collected)",
      };
    }
  }

  return { ok: true, reason: "" };
}

/**
 * Fetch one submitted URL and judge what came back.
 *
 * @param options - The URL, and whether policy wording is required.
 * @returns The verdict, with `unreachable` set when the host could not answer.
 */
export async function checkUrl({ url, requirePolicy = false }) {
  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "BugRout-store-url-check (+https://bugrout.app/support)",
      },
    });
  } catch (err) {
    return {
      url,
      ok: false,
      unreachable: true,
      status: 0,
      reason: `could not be reached: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!response.ok) {
    return {
      url,
      ok: false,
      unreachable: true,
      status: response.status,
      reason: `answered HTTP ${response.status}`,
    };
  }

  const body = await response.text();
  const verdict = classifyBody(body, { requirePolicy });
  return {
    url,
    ok: verdict.ok,
    unreachable: false,
    status: response.status,
    reason: verdict.reason,
    bytes: body.length,
  };
}

/**
 * The URLs this repository submits to the stores, read from the fastlane
 * metadata that is actually uploaded.
 *
 * Read from the files rather than listed here, so changing the submitted URL
 * changes what is checked.
 *
 * @param metadataDir - The `en-US` metadata directory.
 * @returns One target per submitted URL.
 */
export function submittedUrls(metadataDir = METADATA) {
  return [
    { file: "privacy_url.txt", requirePolicy: true },
    { file: "support_url.txt", requirePolicy: false },
  ].map(({ file, requirePolicy }) => ({
    file,
    requirePolicy,
    url: readFileSync(join(metadataDir, file), "utf8").trim(),
  }));
}

/**
 * Check every submitted URL, the ones named on the command line, or a body
 * already on disk.
 *
 * @returns The process exit code.
 */
async function main() {
  const args = process.argv.slice(2);
  const fileAt = args.indexOf("--file");

  if (fileAt !== -1) {
    const path = args[fileAt + 1];
    if (!path || path.startsWith("-")) {
      console.error("--file needs a path.");
      return 1;
    }
    const body = readFileSync(path, "utf8");
    const verdict = classifyBody(body, {
      requirePolicy: !args.includes("--no-policy"),
    });
    if (verdict.ok) {
      console.log(`ok    ${path}  (${body.length} bytes)`);
      return 0;
    }
    console.error(`FAIL  ${path}  ${verdict.reason}`);
    return 1;
  }

  const named = args.filter((a) => !a.startsWith("-"));
  const requirePolicy = !args.includes("--no-policy");
  const targets =
    named.length > 0
      ? named.map((url) => ({ url, file: "argument", requirePolicy }))
      : submittedUrls();

  let worst = 0;
  for (const target of targets) {
    const verdict = await checkUrl(target);
    if (verdict.ok) {
      console.log(
        `ok    ${target.url}  (${target.file}, ${verdict.bytes} bytes)`,
      );
      continue;
    }
    console.error(`FAIL  ${target.url}  (${target.file}) ${verdict.reason}`);
    worst = Math.max(worst, verdict.unreachable ? 2 : 1);
  }

  if (worst !== 0) {
    console.error(
      "\nA store listing may not point at a page that does not exist. Publish the\n" +
        "page at that path, or submit a URL that serves it. See #249.",
    );
  }
  return worst;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exit(await main());
}
