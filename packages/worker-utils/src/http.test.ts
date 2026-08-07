/*
 * Tests for the shared worker HTTP helpers.
 *
 * Focus is the security-sensitive fail-closed CORS allowlist and the
 * conditional emission of optional CORS directives.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { SECURITY_HEADERS, buildCorsHeaders, initWorkerRequest } from "./http";

import type { CorsRequestLike } from "./http";

const POLICY = { methods: "GET, OPTIONS" } as const;

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
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["Strict-Transport-Security"], "max-age=31536000");
    assert.equal(headers["X-Frame-Options"], "DENY");
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
    assert.equal(headers["X-Frame-Options"], "DENY");
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

describe("SECURITY_HEADERS", () => {
  test("contains the baseline hardening headers", () => {
    assert.equal(SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
    assert.equal(
      SECURITY_HEADERS["Strict-Transport-Security"],
      "max-age=31536000",
    );
    assert.equal(SECURITY_HEADERS["X-Frame-Options"], "DENY");
  });
});
