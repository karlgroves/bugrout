/* eslint-disable jsdoc/check-tag-names -- Jest's per-file environment docblock, not JSDoc: node for real HTTP and fetch */
/**
 * @jest-environment node
 */
/* eslint-enable jsdoc/check-tag-names */
/**
 * The E2E suite's Valhalla replay server answers the way the live routing
 * server does (#190).
 *
 * Every Detox route now comes from this server, so a replay that matched the
 * wrong request — or answered an unrecorded one with a route — would make the
 * journey spec pass on a route the app never really asked for. Checked over
 * real HTTP on an ephemeral port.
 */
import fixtures from "../../e2e/fixtures/valhalla-routes.json";
import {
  MATCH_TOLERANCE_M,
  findRecording,
  startReplayServer,
} from "../../e2e/support/valhalla-replay-server";

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const [recording] = fixtures;
if (!recording) throw new Error("no recorded routes");

describe("Valhalla replay server", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = await startReplayServer({ port: 0 });
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  const route = (locations: { lat: number; lon: number }[]) =>
    fetch(`${base}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations, costing: "auto" }),
    });

  it("replays the recorded response for the recorded endpoints", async () => {
    const resp = await route([recording.from, recording.to]);
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual(recording.response);
  });

  it("answers anything unrecorded with the live server's out-of-coverage error", async () => {
    const resp = await route([
      recording.from,
      { lat: 38.2542, lon: -85.7594 }, // Louisville
    ]);
    expect(resp.status).toBe(400);
    expect(await resp.json()).toMatchObject({ error_code: 171 });
  });

  it("matches within the tolerance and not beyond it", () => {
    const metresNorth = (m: number) => ({
      lat: recording.to.lat + m / 111_320,
      lon: recording.to.lon,
    });
    const inside = MATCH_TOLERANCE_M - 20;
    const outside = MATCH_TOLERANCE_M + 20;

    expect(
      findRecording(fixtures, {
        locations: [recording.from, metresNorth(inside)],
      }),
    ).toBeDefined();
    expect(
      findRecording(fixtures, {
        locations: [recording.from, metresNorth(outside)],
      }),
    ).toBeUndefined();
  });

  it("matches on the route's ends, so a stop in between still replays", () => {
    expect(
      findRecording(fixtures, {
        locations: [recording.from, { lat: 39.3, lon: -76.61 }, recording.to],
      }),
    ).toBeDefined();
  });
});
