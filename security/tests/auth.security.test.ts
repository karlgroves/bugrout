/**
 * §10.1 / §10.2 — authentication and authorization regression tests.
 *
 * BugRout has no accounts, sessions or roles, so most of the baseline's
 * scenarios do not apply. What does apply is the shape underneath them: a
 * request without a valid credential must not reach protected data — and data
 * that is public on purpose must be pinned as public, not guarded by a check
 * that never runs (tile-server, #293).
 *
 * Every control here was correct before these tests existed and untested. The
 * point is that deleting one now turns a test red — each assertion below was
 * confirmed to fail with its control removed.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  handleRequest,
  resetRateLimits,
  setRedisClient,
} from "../../backend/services/route-tracker/src/index";
import tileServer from "../../backend/workers/tile-server/src/index";

import {
  assertNoLeakage,
  emptyR2,
  fakeRateLimiter,
  fakeRedis,
  invokeNodeHandler,
  r2With,
} from "./helpers";

const TILE_URL = "https://tiles.example/v1/tiles/bay-area/pmtiles";

setRedisClient(fakeRedis());

describe("tile-server — public by design, rate-limited per IP", () => {
  // #293: tile packages are deliberately public (open-data derivatives, and the
  // app sends no credential). The old API-key check was skipped whenever its
  // key was unset, which was every deployment, so it pinned nothing real. These
  // tests pin the actual contract instead; a future real auth scheme must
  // change them on purpose, not by accident.
  const PACKAGE = "bay-area/bay-area.pmtiles";

  test("a tile package is served with no Authorization header", async () => {
    const res = await tileServer.fetch(new Request(TILE_URL), {
      TILES_BUCKET: r2With({ [PACKAGE]: "pmtiles-bytes" }),
      RATE_LIMITER: fakeRateLimiter(),
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "pmtiles-bytes");
  });

  test("an API_KEY binding does not switch on a hidden key check", async () => {
    // An operator who sets API_KEY must not silently break every shipped build,
    // which sends no key. The worker no longer reads it at all.
    const env = {
      TILES_BUCKET: r2With({ [PACKAGE]: "pmtiles-bytes" }),
      RATE_LIMITER: fakeRateLimiter(),
      API_KEY: "correct-horse-battery-staple",
    };
    const res = await tileServer.fetch(new Request(TILE_URL), env);
    assert.equal(res.status, 200);
  });

  test("the manifest is public", async () => {
    const res = await tileServer.fetch(
      new Request("https://tiles.example/v1/tiles/manifest"),
      { TILES_BUCKET: emptyR2(), RATE_LIMITER: fakeRateLimiter() },
    );
    assert.equal(res.status, 200);
  });

  test("CORS no longer advertises an Authorization header", async () => {
    const res = await tileServer.fetch(
      new Request("https://tiles.example/v1/tiles/manifest", {
        method: "OPTIONS",
      }),
      { TILES_BUCKET: emptyR2(), RATE_LIMITER: fakeRateLimiter() },
    );
    const allowed = res.headers.get("Access-Control-Allow-Headers") ?? "";
    assert.doesNotMatch(allowed, /authorization/i);
  });

  test("requests over the per-IP limit get 429 with Retry-After", async () => {
    const env = {
      TILES_BUCKET: r2With({ [PACKAGE]: "pmtiles-bytes" }),
      RATE_LIMITER: fakeRateLimiter(2),
    };
    const fromIp = (ip: string) =>
      new Request(TILE_URL, { headers: { "CF-Connecting-IP": ip } });

    assert.equal(
      (await tileServer.fetch(fromIp("198.51.100.1"), env)).status,
      200,
    );
    assert.equal(
      (await tileServer.fetch(fromIp("198.51.100.1"), env)).status,
      200,
    );
    const limited = await tileServer.fetch(fromIp("198.51.100.1"), env);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "60");
    assertNoLeakage(await limited.text(), "tile-server 429");

    // The limit is per address: a different client is unaffected.
    assert.equal(
      (await tileServer.fetch(fromIp("198.51.100.2"), env)).status,
      200,
    );
  });

  test("the limiter covers the manifest and unknown paths, not /health", async () => {
    const env = { TILES_BUCKET: emptyR2(), RATE_LIMITER: fakeRateLimiter(0) };
    for (const path of [
      "/v1/tiles/manifest",
      "/v1/tiles/bay-area/fuel",
      "/nope",
    ]) {
      const res = await tileServer.fetch(
        new Request(`https://tiles.example${path}`),
        env,
      );
      assert.equal(res.status, 429, `${path} should be rate-limited`);
    }
    const health = await tileServer.fetch(
      new Request("https://tiles.example/health"),
      env,
    );
    assert.equal(health.status, 200);
  });

  test("the limiter is keyed on CF-Connecting-IP", async () => {
    const limiter = fakeRateLimiter() as unknown as { keys: string[] };
    await tileServer.fetch(
      new Request(TILE_URL, { headers: { "CF-Connecting-IP": "203.0.113.9" } }),
      { TILES_BUCKET: emptyR2(), RATE_LIMITER: limiter as never },
    );
    assert.deepEqual(limiter.keys, ["203.0.113.9"]);
  });

  test("a path that does not match the tile pattern is not served", async () => {
    for (const path of [
      "/v1/tiles/../../etc/passwd",
      "/v1/tiles/bay-area/secrets",
      "/v1/tiles/BAY-AREA/pmtiles",
      "/v1/tiles/bay-area/pmtiles/extra",
    ]) {
      const res = await tileServer.fetch(
        new Request(`https://tiles.example${path}`),
        {
          TILES_BUCKET: r2With({ [PACKAGE]: "pmtiles-bytes" }),
          RATE_LIMITER: fakeRateLimiter(),
        },
      );
      assert.equal(res.status, 404, `${path} should not be served`);
    }
  });
});

describe("route-tracker — every non-health route requires a Bearer token", () => {
  const SECRET = "route-tracker-secret";

  test("no Authorization header is rejected with 401", async () => {
    process.env.API_SECRET = SECRET;
    resetRateLimits();
    const res = await invokeNodeHandler(handleRequest, {
      method: "GET",
      url: "/v1/density/bay-area",
    });
    assert.equal(res.status, 401);
    assertNoLeakage(res.body, "route-tracker 401");
  });

  test("a wrong secret is rejected with 401", async () => {
    process.env.API_SECRET = SECRET;
    resetRateLimits();
    const res = await invokeNodeHandler(handleRequest, {
      method: "GET",
      url: "/v1/density/bay-area",
      headers: { authorization: "Bearer wrong-secret-value" },
    });
    assert.equal(res.status, 401);
  });

  test("a secret without the Bearer prefix is rejected", async () => {
    process.env.API_SECRET = SECRET;
    resetRateLimits();
    const res = await invokeNodeHandler(handleRequest, {
      method: "GET",
      url: "/v1/density/bay-area",
      headers: { authorization: SECRET },
    });
    assert.equal(res.status, 401);
  });

  test("POST /v1/assignment is protected too", async () => {
    process.env.API_SECRET = SECRET;
    resetRateLimits();
    const res = await invokeNodeHandler(handleRequest, {
      method: "POST",
      url: "/v1/assignment",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regionId: "bay-area", edgeIds: ["e1"] }),
    });
    assert.equal(res.status, 401);
  });

  test("/health does not require a token", async () => {
    process.env.API_SECRET = SECRET;
    resetRateLimits();
    const res = await invokeNodeHandler(handleRequest, {
      method: "GET",
      url: "/health",
    });
    assert.equal(res.status, 200);
  });

  test("an unconfigured secret fails closed with 503, not open", async () => {
    // The important half: an auth check that no-ops when unconfigured is
    // worse than no auth check, because it looks protected.
    delete process.env.API_SECRET;
    resetRateLimits();
    const res = await invokeNodeHandler(handleRequest, {
      method: "GET",
      url: "/v1/density/bay-area",
      headers: { authorization: "Bearer anything-at-all" },
    });
    assert.equal(res.status, 503);
    assertNoLeakage(res.body, "route-tracker 503");
    process.env.API_SECRET = SECRET;
  });
});
