/**
 * §10.6 / §5.10 — response header and error-leakage regression tests.
 *
 * Two things are pinned here:
 *
 * 1. Every response path from every backend carries the full security header
 *    set. Not the happy path — the 401s, the 404s, the 413s, the preflights.
 *    A header that appears only on success is not a control.
 * 2. No error body leaks internals, asserted against §18's regex.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  handleRequest,
  resetRateLimits,
  setRedisClient,
} from "../../backend/services/route-tracker/src/index";
import alertAggregator from "../../backend/workers/alert-aggregator/src/index";
import crowdSignal from "../../backend/workers/crowd-signal/src/index";
import tileServer from "../../backend/workers/tile-server/src/index";
import { SECURITY_HEADERS } from "../../packages/worker-utils/src/index";

import {
  LEAKAGE_PATTERN,
  assertNoLeakage,
  emptyR2,
  fakeKv,
  fakeRedis,
  invokeNodeHandler,
} from "./helpers";

setRedisClient(fakeRedis());

const SECRET = "route-tracker-secret";

/**
 * Every header the shared table defines, lower-cased.
 *
 * Two different contracts are at play, and this suite owns the second:
 *
 * - *What* the table must contain is §5.10's list. That is asserted in
 *   `packages/worker-utils/src/http.test.ts`, and extending the table to the
 *   full seven headers is issue #86's work, not this one's.
 * - *That every response path emits the whole table* is asserted here. Deriving
 *   the list from the table rather than restating it is deliberate: this suite
 *   should catch a path that skips headers, and should strengthen on its own
 *   the moment #86 grows the table, without an edit here that could be
 *   forgotten.
 */
const REQUIRED_HEADERS = Object.keys(SECURITY_HEADERS).map((h) =>
  h.toLowerCase(),
);

/**
 * Assert a Fetch API response carries every required header.
 *
 * @param res - The response under test.
 * @param label - Label used in failure messages.
 */
function assertWorkerHeaders(res: Response, label: string): void {
  for (const name of REQUIRED_HEADERS) {
    assert.ok(
      res.headers.get(name),
      `${label} (status ${String(res.status)}): missing ${name}`,
    );
  }
  assert.equal(
    res.headers.get("x-content-type-options")?.toLowerCase(),
    "nosniff",
    `${label}: X-Content-Type-Options must be nosniff`,
  );
}

describe("tile-server — every response path", () => {
  const env = { TILES_BUCKET: emptyR2(), API_KEY: "a-key" };

  test("health, manifest, 401, 404 and preflight all carry the full set", async () => {
    const cases: [string, Request][] = [
      ["health", new Request("https://t.example/health")],
      ["manifest", new Request("https://t.example/v1/tiles/manifest")],
      ["401", new Request("https://t.example/v1/tiles/bay-area/pmtiles")],
      ["404", new Request("https://t.example/nope")],
      [
        "preflight",
        new Request("https://t.example/v1/tiles/manifest", {
          method: "OPTIONS",
        }),
      ],
    ];
    for (const [label, request] of cases) {
      const res = await tileServer.fetch(request, env);
      assertWorkerHeaders(res, `tile-server ${label}`);
      assertNoLeakage(await res.text(), `tile-server ${label}`);
    }
  });
});

describe("crowd-signal — every response path", () => {
  const env = { SIGNALS_KV: fakeKv() };

  test("204, 400 and 413 all carry the full set", async () => {
    const cases: [string, Request][] = [
      [
        "204",
        new Request("https://s.example/v1/signal", {
          method: "POST",
          body: JSON.stringify({ lat: 1, lng: 1, token: "abc" }),
        }),
      ],
      [
        "400",
        new Request("https://s.example/v1/signal", {
          method: "POST",
          body: JSON.stringify({ lat: 999, lng: 1, token: "abc" }),
        }),
      ],
      [
        "413",
        new Request("https://s.example/v1/signal", {
          method: "POST",
          headers: { "Content-Length": "9999" },
          body: JSON.stringify({ lat: 1, lng: 1, token: "abc" }),
        }),
      ],
      ["404", new Request("https://s.example/nope")],
    ];
    for (const [label, request] of cases) {
      const res = await crowdSignal.fetch(request, env);
      assertWorkerHeaders(res, `crowd-signal ${label}`);
      assertNoLeakage(await res.text(), `crowd-signal ${label}`);
    }
  });
});

describe("alert-aggregator — every response path", () => {
  const env = { ALERTS_KV: fakeKv() };

  test("200, 400 and 404 all carry the full set", async () => {
    const cases: [string, Request][] = [
      ["200", new Request("https://a.example/v1/alerts?bbox=-1,-1,1,1")],
      ["400", new Request("https://a.example/v1/alerts")],
      ["404", new Request("https://a.example/nope")],
    ];
    for (const [label, request] of cases) {
      const res = await alertAggregator.fetch(request, env);
      assertWorkerHeaders(res, `alert-aggregator ${label}`);
      assertNoLeakage(await res.text(), `alert-aggregator ${label}`);
    }
  });
});

describe("route-tracker — every response path", () => {
  /**
   * Assert a captured node:http response carries the headers this service
   * actually emits today.
   *
   * Scoped deliberately. route-tracker speaks `node:http`, not the Workers
   * runtime, so it cannot go through `initWorkerRequest` — on `main` it
   * hand-rolls two headers and never imports the shared table, and its
   * rate-limited 429 returns before any header is set at all. Both are
   * findings of issue #86 and are fixed there, so asserting the full table
   * here would make this suite red for a reason that is not its own.
   *
   * What is pinned here is that these two are present on *every* path,
   * including the ones that short-circuit. When #86 lands, this constant
   * should become REQUIRED_HEADERS.
   *
   * @param headers - Lower-cased header map from the capture.
   * @param label - Label used in failure messages.
   */
  function assertNodeHeaders(
    headers: Record<string, string>,
    label: string,
  ): void {
    for (const name of [
      "x-content-type-options",
      "strict-transport-security",
    ]) {
      assert.ok(headers[name], `${label}: missing ${name}`);
    }
  }

  test("200, 204, 400, 401, 404, 413, 429 and 503 all carry the headers", async () => {
    process.env.API_SECRET = SECRET;
    const auth = { authorization: `Bearer ${SECRET}` };

    const cases: [string, Parameters<typeof invokeNodeHandler>[1]][] = [
      ["health 200", { url: "/health" }],
      [
        "assignment 204",
        {
          method: "POST",
          url: "/v1/assignment",
          headers: auth,
          body: JSON.stringify({ regionId: "bay-area", edgeIds: ["e1"] }),
        },
      ],
      [
        "validation 400",
        {
          method: "POST",
          url: "/v1/assignment",
          headers: auth,
          body: JSON.stringify({ regionId: "BAD", edgeIds: ["e1"] }),
        },
      ],
      ["auth 401", { url: "/v1/density/bay-area" }],
      ["not found 404", { url: "/nope", headers: auth }],
      [
        "too large 413",
        {
          method: "POST",
          url: "/v1/assignment",
          headers: auth,
          body: JSON.stringify({
            regionId: "bay-area",
            edgeIds: ["x".repeat(70_000)],
          }),
        },
      ],
      ["preflight 204", { method: "OPTIONS", url: "/v1/assignment" }],
    ];

    for (const [label, options] of cases) {
      resetRateLimits();
      const res = await invokeNodeHandler(handleRequest, options);
      assertNodeHeaders(res.headers, `route-tracker ${label}`);
      assertNoLeakage(res.body, `route-tracker ${label}`);
    }
  });

  test("a rate-limited 429 still carries the headers", async () => {
    // Fails on `main`: the 429 short-circuit returns before setStandardHeaders
    // runs, so every rate-limited response goes out bare. Fixed in #86 — this
    // is the test that will keep it fixed.
    process.env.API_SECRET = SECRET;
    resetRateLimits();
    let last;
    for (let i = 0; i < 130; i += 1) {
      last = await invokeNodeHandler(handleRequest, {
        url: "/health",
        remoteAddress: "198.51.100.9",
      });
    }
    assert.equal(last?.status, 429, "expected the limiter to engage");
    assertNodeHeaders(last.headers, "route-tracker 429");
  });

  test("the unconfigured 503 still carries the headers", async () => {
    delete process.env.API_SECRET;
    resetRateLimits();
    const res = await invokeNodeHandler(handleRequest, {
      url: "/v1/density/bay-area",
      headers: { authorization: "Bearer anything" },
    });
    assert.equal(res.status, 503);
    assertNodeHeaders(res.headers, "route-tracker 503");
    process.env.API_SECRET = SECRET;
  });
});

describe("the leakage pattern itself", () => {
  test("catches the strings it names", () => {
    for (const body of [
      "at /app/node_modules/ioredis/built/index.js:42",
      "SyntaxError: Unexpected token o in JSON at position 1",
      "Stack trace follows",
      "Error: ETIMEDOUT\n  Stack:\n    at connect",
    ]) {
      assert.ok(LEAKAGE_PATTERN.test(body), `should have matched: ${body}`);
    }
  });

  test("does NOT catch a plain stack trace or a runtime error message", () => {
    // Worth recording rather than assuming. §18 specifies
    // /stack|trace|node_modules|syntaxerror/i, which matches on the *words*
    // — not on the shape of a stack trace. A Node trace through application
    // code contains none of them:
    //
    //   Error: boom
    //       at Object.<anonymous> (/app/src/index.js:1:1)
    //
    // Neither does a bare TypeError message. So a handler that returned
    // `err.message`, or `err.stack` for code outside node_modules, would pass
    // this check and still leak.
    //
    // Left as the baseline specifies rather than quietly widened: diverging
    // from the spec should be a decision, not something that happens in a test
    // file. The check is a backstop; what actually protects these services is
    // that no handler puts an error value in a response body at all. Every
    // error body they can produce is one of the fixed strings below, and the
    // suites above assert that on every path.
    for (const body of [
      "Error: boom\n    at Object.<anonymous> (/app/src/index.js:1:1)",
      "TypeError: Cannot read properties of undefined",
      "ReferenceError: db is not defined",
    ]) {
      assert.ok(
        !LEAKAGE_PATTERN.test(body),
        `if this now matches, the regex was widened — update the note: ${body}`,
      );
    }
  });

  test("does not match the error bodies these services actually return", () => {
    for (const body of [
      '{"error":"Unauthorized"}',
      '{"error":"Invalid JSON"}',
      '{"error":"Invalid payload"}',
      '{"error":"Payload too large"}',
      '{"error":"Rate limited"}',
      '{"error":"Service not configured"}',
      '{"error":"Invalid or missing API key"}',
      "Not Found",
    ]) {
      assert.ok(!LEAKAGE_PATTERN.test(body), `false positive on: ${body}`);
    }
  });
});
