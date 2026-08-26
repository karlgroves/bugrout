/**
 * §10.1 / §10.2 — authentication and authorization regression tests.
 *
 * BugRout has no accounts, sessions or roles, so most of the baseline's
 * scenarios do not apply. What does apply is the shape underneath them: a
 * request without a valid credential must not reach protected data.
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
  fakeRedis,
  invokeNodeHandler,
} from "./helpers";

const TILE_URL = "https://tiles.example/v1/tiles/bay-area/pmtiles";

setRedisClient(fakeRedis());

describe("tile-server — protected tile packages", () => {
  test("no Authorization header is rejected with 401", async () => {
    const res = await tileServer.fetch(new Request(TILE_URL), {
      TILES_BUCKET: emptyR2(),
      API_KEY: "correct-horse-battery-staple",
    });
    assert.equal(res.status, 401);
    assertNoLeakage(await res.text(), "tile-server 401");
  });

  test("a wrong key of the same length is rejected", async () => {
    const key = "correct-horse-battery-staple";
    const wrong = "c".repeat(key.length);
    assert.equal(wrong.length, key.length, "test must compare equal lengths");
    const res = await tileServer.fetch(
      new Request(TILE_URL, { headers: { Authorization: `Bearer ${wrong}` } }),
      { TILES_BUCKET: emptyR2(), API_KEY: key },
    );
    assert.equal(res.status, 401);
  });

  test("a wrong key of a different length is rejected", async () => {
    const res = await tileServer.fetch(
      new Request(TILE_URL, { headers: { Authorization: "Bearer short" } }),
      { TILES_BUCKET: emptyR2(), API_KEY: "correct-horse-battery-staple" },
    );
    assert.equal(res.status, 401);
  });

  test("a key without the Bearer prefix is rejected", async () => {
    const key = "correct-horse-battery-staple";
    const res = await tileServer.fetch(
      new Request(TILE_URL, { headers: { Authorization: key } }),
      { TILES_BUCKET: emptyR2(), API_KEY: key },
    );
    assert.equal(res.status, 401);
  });

  test("an empty Bearer value is rejected", async () => {
    const res = await tileServer.fetch(
      new Request(TILE_URL, { headers: { Authorization: "Bearer " } }),
      { TILES_BUCKET: emptyR2(), API_KEY: "correct-horse-battery-staple" },
    );
    assert.equal(res.status, 401);
  });

  test("the correct key gets past auth", async () => {
    const key = "correct-horse-battery-staple";
    const res = await tileServer.fetch(
      new Request(TILE_URL, { headers: { Authorization: `Bearer ${key}` } }),
      { TILES_BUCKET: emptyR2(), API_KEY: key },
    );
    // The fake bucket is empty, so 404 — but not 401, which is the point.
    assert.notEqual(res.status, 401);
  });

  test("the manifest stays public", async () => {
    const res = await tileServer.fetch(
      new Request("https://tiles.example/v1/tiles/manifest"),
      { TILES_BUCKET: emptyR2(), API_KEY: "a-key" },
    );
    assert.notEqual(res.status, 401);
  });

  test("a path that does not match the tile pattern is not served", async () => {
    for (const path of [
      "/v1/tiles/../../etc/passwd",
      "/v1/tiles/bay-area/secrets",
      "/v1/tiles/BAY-AREA/pmtiles",
      "/v1/tiles/bay-area/pmtiles/extra",
    ]) {
      const res = await tileServer.fetch(
        new Request(`https://tiles.example${path}`, {
          headers: { Authorization: "Bearer a-key" },
        }),
        { TILES_BUCKET: emptyR2(), API_KEY: "a-key" },
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
