/**
 * route-tracker — rate-limit keying, limiter bounds, Redis failure handling,
 * query-string routing and density response size.
 *
 * Each test drives the real request handler. Each one fails against the
 * handler as it stood before these controls were added.
 */

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import {
  handleRequest,
  resetRateLimits,
  setRedisClient,
} from "../../backend/services/route-tracker/src/index";

import { assertNoLeakage, fakeRedis, invokeNodeHandler } from "./helpers";

const SECRET = "route-tracker-secret";
const AUTH = { authorization: `Bearer ${SECRET}` };

/**
 * A Redis double whose every command rejects, as ioredis does when Redis is
 * down and `maxRetriesPerRequest` is exhausted.
 *
 * @returns An object shaped like the subset of ioredis that is used.
 */
function rejectingRedis(): never {
  const down = (): Promise<never> =>
    Promise.reject(new Error("Reached the max retries per request limit"));
  return {
    pipeline() {
      const chain = {
        incr: () => chain,
        expire: () => chain,
        exec: down,
      };
      return chain;
    },
    scan: down,
    mget: down,
  } as unknown as never;
}

/**
 * Post an assignment as an authenticated caller.
 *
 * @param edgeIds - Edge ids to report.
 * @param url - Request target.
 * @returns The captured response.
 */
function postAssignment(edgeIds: string[], url = "/v1/assignment") {
  return invokeNodeHandler(handleRequest, {
    method: "POST",
    url,
    headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({ regionId: "md", edgeIds }),
  });
}

afterEach(() => {
  setRedisClient(fakeRedis());
  resetRateLimits();
  process.env.API_SECRET = SECRET;
});

describe("route-tracker — rate-limit key", () => {
  test("rotating X-Forwarded-For does not buy a fresh window", async () => {
    resetRateLimits();
    let last;
    for (let i = 0; i < 130; i += 1) {
      last = await invokeNodeHandler(handleRequest, {
        url: "/health",
        headers: { "x-forwarded-for": `10.0.${i}.1, 198.51.100.20` },
      });
    }
    assert.equal(last?.status, 429);
  });

  test("Fly-Client-IP is the key when the platform sets it", async () => {
    resetRateLimits();
    let last;
    for (let i = 0; i < 130; i += 1) {
      last = await invokeNodeHandler(handleRequest, {
        url: "/health",
        headers: {
          "fly-client-ip": "198.51.100.21",
          "x-forwarded-for": `10.1.${i}.1`,
        },
      });
    }
    assert.equal(last?.status, 429);
    const other = await invokeNodeHandler(handleRequest, {
      url: "/health",
      headers: { "fly-client-ip": "198.51.100.22" },
    });
    assert.equal(other.status, 200, "a different client keeps its own window");
  });

  test("the limiter map is bounded and fails closed when full", async () => {
    resetRateLimits();
    for (let i = 0; i < 10_000; i += 1) {
      const res = await invokeNodeHandler(handleRequest, {
        url: "/health",
        remoteAddress: `client-${i}`,
      });
      assert.equal(res.status, 200);
    }
    const overflow = await invokeNodeHandler(handleRequest, {
      url: "/health",
      remoteAddress: "client-overflow",
    });
    assert.equal(overflow.status, 429);
    const known = await invokeNodeHandler(handleRequest, {
      url: "/health",
      remoteAddress: "client-0",
    });
    assert.equal(known.status, 200, "an already-tracked client is unaffected");
  });
});

describe("route-tracker — a Redis failure is a 503, not a dead process", () => {
  test("assignment answers 503 when the pipeline rejects", async () => {
    setRedisClient(rejectingRedis());
    const res = await postAssignment(["edge-1"]);
    assert.equal(res.status, 503);
    assertNoLeakage(res.body, "route-tracker assignment 503");
  });

  test("density answers 503 when SCAN rejects", async () => {
    setRedisClient(rejectingRedis());
    const res = await invokeNodeHandler(handleRequest, {
      url: "/v1/density/md",
      headers: AUTH,
    });
    assert.equal(res.status, 503);
    assertNoLeakage(res.body, "route-tracker density 503");
  });
});

describe("route-tracker — routing ignores the query string", () => {
  test("an assignment with a query string is recorded", async () => {
    setRedisClient(fakeRedis());
    const res = await postAssignment(["edge-q"], "/v1/assignment?x=1");
    assert.equal(res.status, 204);
    const density = await invokeNodeHandler(handleRequest, {
      url: "/v1/density/md?probe=1",
      headers: AUTH,
    });
    assert.equal(density.status, 200);
    const { edges } = JSON.parse(density.body) as {
      edges: Record<string, number>;
    };
    assert.equal(edges["edge-q"], 1);
  });

  test("a health probe with a query string needs no credential", async () => {
    delete process.env.API_SECRET;
    const res = await invokeNodeHandler(handleRequest, {
      url: "/health?probe=1",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body, "ok");
  });

  test("near-miss health paths are still authenticated", async () => {
    for (const url of ["/health/", "//health", "/healthz", "/health/?x=1"]) {
      const res = await invokeNodeHandler(handleRequest, { url });
      assert.equal(res.status, 401, url);
    }
  });
});

describe("route-tracker — density response size", () => {
  test("a region with more than the cap returns a truncated response", async () => {
    setRedisClient(fakeRedis());
    for (let batch = 0; batch < 11; batch += 1) {
      const ids = Array.from({ length: 1000 }, (_, i) => `e${batch}-${i}`);
      const res = await postAssignment(ids);
      assert.equal(res.status, 204);
    }
    const res = await invokeNodeHandler(handleRequest, {
      url: "/v1/density/md",
      headers: AUTH,
    });
    assert.equal(res.status, 200);
    const body = JSON.parse(res.body) as {
      edges: Record<string, number>;
      truncated: boolean;
    };
    assert.equal(Object.keys(body.edges).length, 10_000);
    assert.equal(body.truncated, true);
  });

  test("an edge id of __proto__ is reported as its own key", async () => {
    setRedisClient(fakeRedis());
    await postAssignment(["__proto__"]);
    const res = await invokeNodeHandler(handleRequest, {
      url: "/v1/density/md",
      headers: AUTH,
    });
    const body = JSON.parse(res.body) as {
      edges: Record<string, number>;
      truncated: boolean;
    };
    assert.equal(Object.hasOwn(body.edges, "__proto__"), true);
    assert.equal(body.truncated, false);
  });
});
