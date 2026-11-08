/**
 * alert-aggregator fail-open regression tests (#301).
 *
 * The aggregator is a threat feed. Three properties are pinned here, each
 * against the real `scheduled` and `fetch` handlers with a faked KV and a
 * stubbed upstream `fetch`:
 *
 * 1. A failed upstream poll never replaces the last good threat set, and is
 *    never stored as "no threats".
 * 2. Absence is legible: no data at all is a non-cacheable 503, a partial
 *    answer names the missing source, and every answer says when each
 *    source was fetched.
 * 3. The bbox the read path validates is the bbox it serves, and it cannot be
 *    widened to pull the whole national set.
 */

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import alertAggregator from "../../backend/workers/alert-aggregator/src/index";

import { fakeKv } from "./helpers";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A square polygon around (lng, lat), half-width d degrees. */
function square(lng: number, lat: number, d = 0.1): unknown {
  return {
    type: "Polygon",
    coordinates: [
      [
        [lng - d, lat - d],
        [lng + d, lat - d],
        [lng + d, lat + d],
        [lng - d, lat + d],
        [lng - d, lat - d],
      ],
    ],
  };
}

/** NWS response body with one alert near (lng, lat). */
function nwsBody(id: string, lng: number, lat: number): string {
  return JSON.stringify({
    features: [
      {
        properties: { id, severity: "Severe", headline: id },
        geometry: square(lng, lat),
      },
    ],
  });
}

/** NIFC response body with one fire perimeter near (lng, lat). */
function nifcBody(name: string, lng: number, lat: number): string {
  return JSON.stringify({
    features: [
      {
        properties: { poly_IncidentName: name, irwin_PercentContained: 10 },
        geometry: square(lng, lat),
      },
    ],
  });
}

/**
 * Replace global fetch with a stub that answers by upstream host.
 *
 * @param nws - Status and body for api.weather.gov, or "throw".
 * @param nifc - Status and body for the NIFC ArcGIS service, or "throw".
 */
function stubUpstreams(
  nws: [number, string] | "throw",
  nifc: [number, string] | "throw",
): void {
  globalThis.fetch = (input: RequestInfo | URL): Promise<Response> => {
    const href = input instanceof Request ? input.url : String(input);
    const answer = href.includes("api.weather.gov") ? nws : nifc;
    if (answer === "throw") return Promise.reject(new Error("timeout"));
    return Promise.resolve(new Response(answer[1], { status: answer[0] }));
  };
}

/**
 * Run one cron tick against the given KV.
 *
 * @param kv - The faked KV namespace.
 */
async function tick(kv: never): Promise<void> {
  await alertAggregator.scheduled({}, { ALERTS_KV: kv });
}

/**
 * Read alerts for a bbox.
 *
 * @param kv - The faked KV namespace.
 * @param bbox - The bbox query value.
 * @returns The response.
 */
function read(kv: never, bbox = "-80,35,-70,45"): Promise<Response> {
  return alertAggregator.fetch(
    new Request(`https://alerts.example/v1/alerts?bbox=${bbox}`),
    { ALERTS_KV: kv },
  );
}

/** Served body shape. */
interface Served {
  sources: { nws?: { fetchedAt: number }; usfs?: { fetchedAt: number } };
  missingSources: string[];
  features: { properties: { id: string } }[];
}

/** Silence the expected failure log for one block. */
async function quietly(fn: () => Promise<void>): Promise<void> {
  const original = console.error;
  console.error = (): void => undefined;
  try {
    await fn();
  } finally {
    console.error = original;
  }
}

describe("alert-aggregator — a failed poll keeps the last good set", () => {
  test("both upstreams failing leaves the previous threats in place", async () => {
    const kv = fakeKv();
    stubUpstreams(
      [200, nwsBody("nws-1", -75, 40)],
      [200, nifcBody("Ridge", -76, 39)],
    );
    await tick(kv);

    stubUpstreams([429, "rate limited"], "throw");
    await quietly(() => tick(kv));

    const res = await read(kv);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Served;
    assert.deepEqual(body.features.map((f) => f.properties.id).sort(), [
      "fire-Ridge",
      "nws-1",
    ]);
  });

  test("an upstream 500 is a failure, not an empty set", async () => {
    const kv = fakeKv();
    stubUpstreams(
      [200, nwsBody("nws-1", -75, 40)],
      [200, nifcBody("Ridge", -76, 39)],
    );
    await tick(kv);

    stubUpstreams([500, "oops"], [200, JSON.stringify({ features: [] })]);
    await quietly(() => tick(kv));

    const body = (await (await read(kv)).json()) as Served;
    // NWS kept its last good alert; NIFC genuinely reported no fires.
    assert.deepEqual(
      body.features.map((f) => f.properties.id),
      ["nws-1"],
    );
  });

  test("a source that has never succeeded is reported missing", async () => {
    const kv = fakeKv();
    stubUpstreams([200, nwsBody("nws-1", -75, 40)], [503, "down"]);
    await quietly(() => tick(kv));

    const res = await read(kv);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    const body = (await res.json()) as Served;
    assert.deepEqual(body.missingSources, ["usfs"]);
    assert.equal(typeof body.sources.nws?.fetchedAt, "number");
  });
});

describe("alert-aggregator — absence is not 'no threats'", () => {
  test("no data at all is a non-cacheable 503", async () => {
    const res = await read(fakeKv());
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    const body = (await res.json()) as { missingSources: string[] };
    assert.deepEqual(body.missingSources.sort(), ["nws", "usfs"]);
  });

  test("a complete answer is cacheable and says when it was fetched", async () => {
    const kv = fakeKv();
    stubUpstreams(
      [200, nwsBody("nws-1", -75, 40)],
      [200, nifcBody("Ridge", -76, 39)],
    );
    await tick(kv);

    const res = await read(kv);
    assert.equal(res.headers.get("Cache-Control"), "max-age=900");
    const body = (await res.json()) as Served;
    assert.deepEqual(body.missingSources, []);
    assert.equal(typeof body.sources.nws?.fetchedAt, "number");
    assert.equal(typeof body.sources.usfs?.fetchedAt, "number");
  });
});

describe("alert-aggregator — the bbox is honoured", () => {
  test("features outside the bbox are not served", async () => {
    const kv = fakeKv();
    // NWS alert in Maryland, fire in California.
    stubUpstreams(
      [200, nwsBody("nws-md", -76.6, 39.3)],
      [200, nifcBody("Camp", -121.6, 39.8)],
    );
    await tick(kv);

    const east = (await (await read(kv, "-80,35,-70,45")).json()) as Served;
    assert.deepEqual(
      east.features.map((f) => f.properties.id),
      ["nws-md"],
    );
    const west = (await (await read(kv, "-125,35,-115,45")).json()) as Served;
    assert.deepEqual(
      west.features.map((f) => f.properties.id),
      ["fire-Camp"],
    );
  });

  test("an oversized or inverted bbox is rejected with 400", async () => {
    for (const bbox of [
      "-180,-90,180,90",
      "-125,24,-66,50",
      "-70,35,-80,45",
      "-80,45,-70,35",
      "-200,0,-190,10",
    ]) {
      const res = await read(fakeKv(), bbox);
      assert.equal(res.status, 400, `bbox ${bbox}`);
    }
  });
});
