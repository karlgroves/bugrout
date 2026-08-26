/*
 * Tests for the shared worker HTTP helpers.
 *
 * Focus is the security-sensitive fail-closed CORS allowlist and the
 * conditional emission of optional CORS directives.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import {
  REQUIRED_SECURITY_HEADER_NAMES,
  SECURITY_HEADERS,
  buildCorsHeaders,
  initWorkerRequest,
} from "./http";

import type { CorsRequestLike } from "./http";

const POLICY = { methods: "GET, OPTIONS" } as const;

/**
 * Assert that a response header map carries every required security header
 * with the exact value from the shared table.
 *
 * Checking the whole set rather than a remembered subset is the point: the
 * previous spot-check named three headers, so extending SECURITY_HEADERS to
 * eight would not have failed a single test.
 */
function assertAllSecurityHeaders(
  headers: Record<string, string>,
  label: string,
): void {
  for (const name of REQUIRED_SECURITY_HEADER_NAMES) {
    assert.equal(
      headers[name],
      SECURITY_HEADERS[name],
      `${label}: missing or wrong ${name}`,
    );
  }
}

/**
 * Minimal stand-in for a platform Request, matching {@link CorsRequestLike}.
 */
function fakeRequest(
  url: string,
  method = "GET",
  origin?: string,
): CorsRequestLike {
  return {
    url,
    method,
    headers: {
      get: (name) =>
        name === "Origin" && origin !== undefined ? origin : null,
    },
  };
}

describe("buildCorsHeaders — fail-closed allowlist", () => {
  test("denies cross-origin when no allowlist is configured", () => {
    const headers = buildCorsHeaders("https://evil.example", undefined, POLICY);
    assert.equal(headers["Access-Control-Allow-Origin"], "");
  });

  test("denies cross-origin when the allowlist is empty", () => {
    const headers = buildCorsHeaders("https://evil.example", "", POLICY);
    assert.equal(headers["Access-Control-Allow-Origin"], "");
  });

  test("denies an origin that is not in the allowlist", () => {
    const headers = buildCorsHeaders(
      "https://evil.example",
      "https://bugrout.app",
      POLICY,
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "");
  });

  test("echoes an origin present in the allowlist", () => {
    const headers = buildCorsHeaders(
      "https://bugrout.app",
      "https://bugrout.app",
      POLICY,
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "https://bugrout.app");
  });

  test("trims whitespace around comma-separated allowlist entries", () => {
    const headers = buildCorsHeaders(
      "https://bugrout.app",
      " https://other.app , https://bugrout.app ",
      POLICY,
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "https://bugrout.app");
  });

  test("denies an empty request origin even when an allowlist exists", () => {
    const headers = buildCorsHeaders("", "https://bugrout.app", POLICY);
    assert.equal(headers["Access-Control-Allow-Origin"], "");
  });
});

describe("buildCorsHeaders — directive emission", () => {
  test("emits only Allow-Origin and Allow-Methods by default", () => {
    const headers = buildCorsHeaders("", undefined, {
      methods: "GET, OPTIONS",
    });
    assert.deepEqual(Object.keys(headers).sort(), [
      "Access-Control-Allow-Methods",
      "Access-Control-Allow-Origin",
    ]);
    assert.equal(headers["Access-Control-Allow-Methods"], "GET, OPTIONS");
  });

  test("emits optional directives only when the policy supplies them", () => {
    const headers = buildCorsHeaders("", undefined, {
      methods: "GET, POST, OPTIONS",
      allowHeaders: "Content-Type",
      exposeHeaders: "ETag",
      maxAge: 86400,
    });
    assert.equal(headers["Access-Control-Allow-Headers"], "Content-Type");
    assert.equal(headers["Access-Control-Expose-Headers"], "ETag");
    assert.equal(headers["Access-Control-Max-Age"], "86400");
  });

  test("stringifies maxAge, including the zero edge case", () => {
    const headers = buildCorsHeaders("", undefined, {
      methods: "GET",
      maxAge: 0,
    });
    assert.equal(headers["Access-Control-Max-Age"], "0");
  });

  test("omits Allow-Headers when not supplied", () => {
    const headers = buildCorsHeaders("", undefined, { methods: "GET" });
    assert.equal(headers["Access-Control-Allow-Headers"], undefined);
    assert.equal(headers["Access-Control-Expose-Headers"], undefined);
    assert.equal(headers["Access-Control-Max-Age"], undefined);
  });
});

describe("initWorkerRequest", () => {
  test("parses the request URL", () => {
    const { url } = initWorkerRequest(
      fakeRequest("https://tiles.bugrout.app/v1/tiles/manifest?region=bay"),
      undefined,
      POLICY,
    );
    assert.equal(url.pathname, "/v1/tiles/manifest");
    assert.equal(url.searchParams.get("region"), "bay");
  });

  test("always merges in the baseline security headers", () => {
    const { headers } = initWorkerRequest(
      fakeRequest("https://x.example/"),
      undefined,
      POLICY,
    );
    assertAllSecurityHeaders(headers, "plain GET");
  });

  test("fails closed when no allowlist is configured", () => {
    const { headers } = initWorkerRequest(
      fakeRequest("https://x.example/", "GET", "https://evil.example"),
      undefined,
      POLICY,
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "");
  });

  test("denies an origin that is not in the allowlist", () => {
    const { headers } = initWorkerRequest(
      fakeRequest("https://x.example/", "GET", "https://evil.example"),
      "https://bugrout.app",
      POLICY,
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "");
  });

  test("echoes an allowlisted origin", () => {
    const { headers } = initWorkerRequest(
      fakeRequest("https://x.example/", "GET", "https://bugrout.app"),
      "https://bugrout.app",
      POLICY,
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "https://bugrout.app");
  });

  test("treats a missing Origin header as empty, not undefined", () => {
    const { headers } = initWorkerRequest(
      fakeRequest("https://x.example/"),
      "https://bugrout.app",
      POLICY,
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "");
  });

  test("flags OPTIONS as a preflight", () => {
    const { isPreflight } = initWorkerRequest(
      fakeRequest("https://x.example/", "OPTIONS"),
      undefined,
      POLICY,
    );
    assert.equal(isPreflight, true);
  });

  test("does not flag non-OPTIONS methods as preflight", () => {
    for (const method of ["GET", "POST", "HEAD"]) {
      const { isPreflight } = initWorkerRequest(
        fakeRequest("https://x.example/", method),
        undefined,
        POLICY,
      );
      assert.equal(isPreflight, false, `${method} should not be a preflight`);
    }
  });

  test("a preflight still carries the security headers and CORS decision", () => {
    const { headers } = initWorkerRequest(
      fakeRequest("https://x.example/", "OPTIONS", "https://evil.example"),
      "https://bugrout.app",
      POLICY,
    );
    assert.equal(headers["Access-Control-Allow-Origin"], "");
    assertAllSecurityHeaders(headers, "denied preflight");
  });

  test("passes optional policy directives through", () => {
    const { headers } = initWorkerRequest(
      fakeRequest("https://x.example/"),
      undefined,
      {
        methods: "GET, POST, OPTIONS",
        allowHeaders: "Content-Type",
        maxAge: 86400,
      },
    );
    assert.equal(headers["Access-Control-Allow-Methods"], "GET, POST, OPTIONS");
    assert.equal(headers["Access-Control-Allow-Headers"], "Content-Type");
    assert.equal(headers["Access-Control-Max-Age"], "86400");
  });
});

describe("SECURITY_HEADERS — the required set", () => {
  test("carries every header the baseline requires", () => {
    assert.deepEqual([...REQUIRED_SECURITY_HEADER_NAMES].sort(), [
      "Content-Security-Policy",
      "Cross-Origin-Opener-Policy",
      "Cross-Origin-Resource-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]);
  });

  test("HSTS covers subdomains and is preload-eligible", () => {
    const hsts = SECURITY_HEADERS["Strict-Transport-Security"] ?? "";
    assert.match(hsts, /max-age=31536000/);
    assert.match(hsts, /includeSubDomains/);
    assert.match(hsts, /preload/);
  });

  test("CSP denies both subresources and framing", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"] ?? "";
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
  });

  test("no header value is empty", () => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      assert.notEqual(value, "", `${name} must not be empty`);
    }
  });
});

/*
 * route-tracker is a `node:http` service, not a Worker, so it cannot go through
 * initWorkerRequest — it spreads SECURITY_HEADERS onto its own responses. That
 * makes it the one backend a unit test of this module cannot reach, and it is
 * exactly where the drift happened: it hand-rolled two of the headers and never
 * imported the shared table, so extending SECURITY_HEADERS silently left it
 * behind.
 *
 * This is a source-level guard rather than a behavioural one. Asserting on real
 * responses means starting the service, which needs Redis; endpoint-level
 * security regression tests are issue #87. What this catches is the specific
 * regression that already occurred once: a backend setting a required header by
 * hand instead of importing it.
 */
describe("route-tracker does not hand-roll the shared headers", () => {
  const source = readFileSync(
    path.join(
      import.meta.dirname,
      "../../../backend/services/route-tracker/src/index.ts",
    ),
    "utf8",
  );

  test("imports SECURITY_HEADERS from this package", () => {
    assert.match(
      source,
      /import\s*\{[^}]*\bSECURITY_HEADERS\b[^}]*\}\s*from\s*"@bugrout\/worker-utils"/,
    );
  });

  test("spreads the table rather than naming headers individually", () => {
    for (const name of REQUIRED_SECURITY_HEADER_NAMES) {
      assert.ok(
        !source.includes(`setHeader("${name}"`),
        `route-tracker hand-rolls ${name}; spread SECURITY_HEADERS instead`,
      );
    }
  });

  test("sets the standard headers before the rate-limit short-circuit", () => {
    const headersAt = source.indexOf("setStandardHeaders(req, res)");
    const rateLimitAt = source.indexOf("if (isRateLimited(clientIp))");
    assert.ok(headersAt > 0 && rateLimitAt > 0, "both call sites must exist");
    assert.ok(
      headersAt < rateLimitAt,
      "a 429 must still carry the security headers",
    );
  });
});
