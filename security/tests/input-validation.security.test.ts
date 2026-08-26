/**
 * §10.4 — input validation regression tests.
 *
 * The validation in these services was written carefully and had no test that
 * would notice if it were removed. These drive the real handlers with hostile
 * input and assert the rejection, not the implementation.
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

import {
  assertNoLeakage,
  fakeKv,
  fakeRedis,
  invokeNodeHandler,
} from "./helpers";

const SECRET = "route-tracker-secret";

// Every request below runs against an in-memory double, so a request that gets
// past validation completes instead of hanging on ioredis's reconnect loop.
setRedisClient(fakeRedis());

/**
 * Post an assignment payload as an authenticated caller.
 *
 * @param body - Raw request body.
 * @param headers - Extra request headers.
 * @returns The captured response.
 */
async function postAssignment(
  body: string,
  headers: Record<string, string> = {},
) {
  process.env.API_SECRET = SECRET;
  resetRateLimits();
  return invokeNodeHandler(handleRequest, {
    method: "POST",
    url: "/v1/assignment",
    headers: {
      authorization: `Bearer ${SECRET}`,
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

describe("route-tracker — regionId and edgeId allowlists", () => {
  test("a well-formed payload is accepted past validation", async () => {
    const res = await postAssignment(
      JSON.stringify({ regionId: "bay-area", edgeIds: ["edge_1", "e-2:3"] }),
    );
    assert.notEqual(res.status, 400, "valid input must not be rejected");
  });

  test("hostile regionIds are rejected with 400", async () => {
    for (const regionId of [
      "../../etc/passwd",
      "bay area",
      "bay-area; DROP TABLE",
      "<script>alert(1)</script>",
      "BAY-AREA",
      "1-starts-with-digit",
      "-starts-with-dash",
      "a".repeat(65),
      "",
      "{{7*7}}",
      "$(whoami)",
    ]) {
      const res = await postAssignment(
        JSON.stringify({ regionId, edgeIds: ["e1"] }),
      );
      assert.equal(res.status, 400, `regionId ${JSON.stringify(regionId)}`);
      assertNoLeakage(res.body, "regionId rejection");
    }
  });

  test("hostile edgeIds are rejected with 400", async () => {
    for (const edgeId of [
      "../../../secret",
      "edge id with spaces",
      "<img src=x onerror=1>",
      "e".repeat(129),
      "",
      "edge\nid",
      "*",
    ]) {
      const res = await postAssignment(
        JSON.stringify({ regionId: "bay-area", edgeIds: [edgeId] }),
      );
      assert.equal(res.status, 400, `edgeId ${JSON.stringify(edgeId)}`);
    }
  });

  test("one bad id in an otherwise valid array rejects the whole request", async () => {
    const res = await postAssignment(
      JSON.stringify({
        regionId: "bay-area",
        edgeIds: ["good-1", "../bad", "good-2"],
      }),
    );
    assert.equal(res.status, 400);
  });

  test("wrong types are rejected rather than coerced", async () => {
    for (const payload of [
      { regionId: 123, edgeIds: ["e1"] },
      { regionId: "bay-area", edgeIds: "e1" },
      { regionId: "bay-area", edgeIds: [1, 2, 3] },
      { regionId: null, edgeIds: ["e1"] },
      { edgeIds: ["e1"] },
      { regionId: "bay-area" },
      [],
      "a string",
      42,
      null,
    ]) {
      const res = await postAssignment(JSON.stringify(payload));
      assert.equal(res.status, 400, `payload ${JSON.stringify(payload)}`);
    }
  });

  test("malformed JSON is rejected with 400 and no parser detail", async () => {
    const res = await postAssignment("{not json at all");
    assert.equal(res.status, 400);
    // A raw JSON.parse error would say "Unexpected token ... in JSON" and, in
    // some runtimes, carry a stack. §18's regex covers "syntaxerror".
    assertNoLeakage(res.body, "malformed JSON");
  });

  test("an over-long edgeIds array is rejected", async () => {
    const res = await postAssignment(
      JSON.stringify({
        regionId: "bay-area",
        edgeIds: Array.from({ length: 1001 }, (_, i) => `e${String(i)}`),
      }),
    );
    assert.equal(res.status, 400);
  });

  test("a body over 64 KB is rejected with 413", async () => {
    const huge = "x".repeat(70_000);
    const res = await postAssignment(
      JSON.stringify({ regionId: "bay-area", edgeIds: [huge] }),
    );
    assert.equal(res.status, 413);
    assertNoLeakage(res.body, "413");
  });

  test("a hostile regionId in the density path does not match the route", async () => {
    process.env.API_SECRET = SECRET;
    for (const path of [
      "/v1/density/../../etc/passwd",
      "/v1/density/BAY-AREA",
      "/v1/density/bay area",
      "/v1/density/",
    ]) {
      resetRateLimits();
      const res = await invokeNodeHandler(handleRequest, {
        method: "GET",
        url: path,
        headers: { authorization: `Bearer ${SECRET}` },
      });
      assert.equal(res.status, 404, `${path} should not route`);
    }
  });
});

describe("crowd-signal — coordinate and token validation", () => {
  /**
   * Post a telemetry payload to the crowd-signal worker.
   *
   * @param payload - The body to send.
   * @returns The worker's response.
   */
  function post(payload: unknown): Promise<Response> {
    return crowdSignal.fetch(
      new Request("https://signal.example/v1/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      { SIGNALS_KV: fakeKv() },
    );
  }

  test("out-of-range coordinates are rejected with 400", async () => {
    for (const coords of [
      { lat: 91, lng: 0 },
      { lat: -91, lng: 0 },
      { lat: 0, lng: 181 },
      { lat: 0, lng: -181 },
    ]) {
      const res = await post({ ...coords, token: "abc123" });
      assert.equal(res.status, 400, JSON.stringify(coords));
    }
  });

  test("a missing or non-string token is rejected", async () => {
    for (const token of [undefined, "", 123, null, {}]) {
      const res = await post({ lat: 37.7, lng: -122.4, token });
      assert.equal(res.status, 400, `token ${JSON.stringify(token)}`);
    }
  });

  test("malformed JSON is rejected with 400", async () => {
    const res = await crowdSignal.fetch(
      new Request("https://signal.example/v1/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{oops",
      }),
      { SIGNALS_KV: fakeKv() },
    );
    assert.equal(res.status, 400);
    assertNoLeakage(await res.text(), "crowd-signal malformed JSON");
  });

  test("a declared Content-Length over 1 KB is rejected with 413", async () => {
    const res = await crowdSignal.fetch(
      new Request("https://signal.example/v1/signal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "2048",
        },
        body: JSON.stringify({ lat: 1, lng: 1, token: "abc" }),
      }),
      { SIGNALS_KV: fakeKv() },
    );
    assert.equal(res.status, 413);
  });

  test("a valid signal is accepted", async () => {
    const res = await post({ lat: 37.7749, lng: -122.4194, token: "abc123" });
    assert.equal(res.status, 204);
  });
});

describe("alert-aggregator — bbox validation", () => {
  /**
   * Request alerts for a bbox query string.
   *
   * @param query - The raw query string, without the leading `?`.
   * @returns The worker's response.
   */
  function get(query: string): Promise<Response> {
    return alertAggregator.fetch(
      new Request(`https://alerts.example/v1/alerts?${query}`),
      { ALERTS_KV: fakeKv() },
    );
  }

  test("a missing bbox is rejected with 400", async () => {
    const res = await get("");
    assert.equal(res.status, 400);
    assertNoLeakage(await res.text(), "missing bbox");
  });

  test("a malformed bbox is rejected with 400", async () => {
    for (const bbox of [
      "1,2,3",
      "1,2,3,4,5",
      "a,b,c,d",
      "1,2,3,x",
      ",,,",
      "<script>,2,3,4",
    ]) {
      const res = await get(`bbox=${encodeURIComponent(bbox)}`);
      assert.equal(res.status, 400, `bbox ${bbox}`);
    }
  });

  test("a well-formed bbox is accepted", async () => {
    const res = await get("bbox=-122.5,37.7,-122.3,37.9");
    assert.notEqual(res.status, 400);
  });
});
