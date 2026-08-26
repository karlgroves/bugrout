#!/usr/bin/env node
/**
 * §15 — security header check against a running target.
 *
 * Complements the unit tests in `security/tests/headers.security.test.ts`.
 * Those assert what the handler constructs; this asserts what a client
 * actually receives, which is a different question — a platform, a proxy or a
 * CDN in front of the worker can strip or override a header the code set.
 *
 * Usage:
 *   node security/scripts/check-headers.js <url> [<url> ...]
 *   node security/scripts/check-headers.js --production <url>
 *
 * Exit codes:
 *   0  every required header present on every target
 *   1  at least one blocking failure
 *   2  a target could not be reached
 *
 * Thresholds come from security/config/security-thresholds.json, so the
 * severity of a missing header is configured in one place rather than encoded
 * here.
 *
 * Note a tension in the baseline, resolved deliberately: §15 lists HSTS,
 * Referrer-Policy and Permissions-Policy as *required*, while §11 sets their
 * thresholds to `fail_in_production`, `warn` and `warn`. §11 is the more
 * specific statement about what blocks, so it wins — a missing Referrer-Policy
 * warns rather than failing a pull request, and a missing HSTS blocks only
 * under --production. Change security-thresholds.json to change that; do not
 * change it here.
 */

// CommonJS on purpose. §6 names this file `check-headers.js`, and the
// repository root has no `"type": "module"`, so an ESM `.js` here would emit a
// MODULE_TYPELESS_PACKAGE_JSON warning on every CI run. Keeping the spec's
// filename is worth more than the import syntax.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const THRESHOLDS = JSON.parse(
  readFileSync(
    join(__dirname, "..", "config", "security-thresholds.json"),
    "utf8",
  ),
);

/** Headers §15 requires. */
const REQUIRED_HEADERS = [
  "x-content-type-options",
  "strict-transport-security",
  "referrer-policy",
  "permissions-policy",
];

/** Headers §15 recommends. */
const RECOMMENDED_HEADERS = [
  "content-security-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
];

/** Map a header name to its threshold key in the config. */
const THRESHOLD_KEYS = {
  "strict-transport-security": "missing_hsts",
  "content-security-policy": "missing_csp",
  "x-content-type-options": "missing_x_content_type_options",
  "referrer-policy": "missing_referrer_policy",
  "permissions-policy": "missing_permissions_policy",
};

/**
 * Decide whether a missing header blocks, given the configured threshold.
 *
 * @param {string} header - Lower-cased header name.
 * @param {boolean} production - Whether this run targets production.
 * @returns {"fail"|"warn"} What to do about it.
 */
function severityFor(header, production) {
  const key = THRESHOLD_KEYS[header];
  const configured = key ? THRESHOLDS.headers?.[key] : undefined;
  if (configured === "fail") return "fail";
  if (configured === "fail_in_production") return production ? "fail" : "warn";
  if (configured === "warn") return "warn";
  // Unconfigured: required headers block, recommended ones warn.
  return REQUIRED_HEADERS.includes(header) ? "fail" : "warn";
}

/**
 * Check one target's response headers.
 *
 * @param {string} url - Absolute URL to check.
 * @param {boolean} production - Whether this run targets production.
 * @returns {Promise<{failures: string[], warnings: string[]}>} Findings.
 */
async function checkHeaders(url, production) {
  const failures = [];
  const warnings = [];

  if (production && !url.startsWith("https://")) {
    failures.push(
      `${url}: production targets must be HTTPS — a header check over plaintext proves nothing`,
    );
    return { failures, warnings };
  }

  // redirect: "manual" on purpose. Following a redirect would check the
  // headers of wherever it lands, not of the endpoint under test.
  const response = await fetch(url, { redirect: "manual" });

  for (const header of [...REQUIRED_HEADERS, ...RECOMMENDED_HEADERS]) {
    if (response.headers.get(header)) continue;
    const line = `${url}: missing ${header}`;
    if (severityFor(header, production) === "fail") failures.push(line);
    else warnings.push(line);
  }

  const xcto = response.headers.get("x-content-type-options");
  if (xcto && xcto.toLowerCase() !== "nosniff") {
    failures.push(
      `${url}: X-Content-Type-Options must be nosniff, got ${xcto}`,
    );
  }

  const hsts = response.headers.get("strict-transport-security");
  if (hsts && !/max-age=\d+/.test(hsts)) {
    failures.push(`${url}: Strict-Transport-Security has no max-age`);
  }
  if (hsts && !/includeSubDomains/i.test(hsts)) {
    warnings.push(`${url}: Strict-Transport-Security omits includeSubDomains`);
  }

  const csp = response.headers.get("content-security-policy");
  if (csp && !/frame-ancestors/i.test(csp)) {
    warnings.push(
      `${url}: CSP has no frame-ancestors — prefer it over X-Frame-Options`,
    );
  }

  return { failures, warnings };
}

/**
 * Print a remediation hint for a finding.
 *
 * @param {string} line - The finding text.
 * @returns {string} An actionable next step.
 */
function remediation(line) {
  if (line.includes("missing ")) {
    return "    → add it to SECURITY_HEADERS in packages/worker-utils/src/http.ts";
  }
  if (line.includes("must be nosniff")) {
    return "    → set X-Content-Type-Options: nosniff";
  }
  if (line.includes("no max-age")) {
    return "    → set Strict-Transport-Security: max-age=31536000; includeSubDomains; preload";
  }
  if (line.includes("HTTPS")) {
    return "    → point the check at the HTTPS origin";
  }
  return "    → see security/docs/security-automation.md";
}

/**
 * Entry point.
 *
 * @returns {Promise<number>} Process exit code.
 */
async function main() {
  const args = process.argv.slice(2);
  const production = args.includes("--production");
  const targets = args.filter((a) => !a.startsWith("--"));

  if (targets.length === 0) {
    console.error(
      "usage: node security/scripts/check-headers.js [--production] <url> [<url> ...]",
    );
    return 1;
  }

  let failed = 0;
  let warned = 0;

  for (const target of targets) {
    let result;
    try {
      result = await checkHeaders(target, production);
    } catch (err) {
      console.error(`✖ ${target}: unreachable — ${String(err)}`);
      console.error(
        "    → is the target running? see security/docs/security-automation.md",
      );
      return 2;
    }

    for (const line of result.failures) {
      console.error(`✖ ${line}`);
      console.error(remediation(line));
      failed += 1;
    }
    for (const line of result.warnings) {
      console.warn(`⚠ ${line}`);
      warned += 1;
    }
    if (result.failures.length === 0 && result.warnings.length === 0) {
      console.log(`✔ ${target}: all required and recommended headers present`);
    }
  }

  console.log(
    `\nheader check: ${String(failed)} blocking, ${String(warned)} warnings`,
  );
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exit(code);
  },
  (err) => {
    console.error(err);
    process.exit(2);
  },
);
