/**
 * E2E Test: Offline Maps Downloads
 */

import { by, element, expect, waitFor } from "detox";

import { launchToMapScreen } from "./support/launch";

/** The tile server the app build talks to; same default as TileManager. */
const TILE_SERVER_BASE =
  process.env.EXPO_PUBLIC_TILE_SERVER_URL ??
  "https://bugrout-tile-server.karlgroves.workers.dev";

/**
 * The region names the manifest publishes, in the order the screen lists them.
 *
 * @returns Region display names.
 */
async function publishedRegionNames(): Promise<string[]> {
  const resp = await fetch(`${TILE_SERVER_BASE}/v1/tiles/manifest`);
  if (!resp.ok) throw new Error(`manifest: HTTP ${String(resp.status)}`);
  const manifest = (await resp.json()) as { regions: { name: string }[] };
  return manifest.regions.map((r) => r.name);
}

describe("Offline Maps", () => {
  beforeAll(async () => {
    await launchToMapScreen();
  });

  it("navigates to downloads from settings", async () => {
    await element(by.text("Settings")).tap();
    await element(by.id("settings-row-offline-maps")).tap();
    // Addressed by testID. This assertion used to name the screen's intro
    // copy, and it named only the first sentence of it — the paragraph goes on
    // "Maps include routing data, fuel stations, water sources, and shelters."
    // in the same Text node, and `by.text` is an exact match, so it could not
    // hit. The screen was reached correctly the whole time; the artifact
    // screenshot for E2E run 33691459602 shows it fully rendered behind the
    // failure. `downloads-screen` is the handle navigation-flow.test.ts
    // already uses for the same screen.
    await expect(element(by.id("downloads-screen"))).toBeVisible();
  });

  it("shows storage info", async () => {
    // The storage bar lives in the list header, so it leaves the viewport as
    // soon as anything scrolls — and the regions test below scrolls a long way.
    // Reset to the top rather than relying on this `it` running first, so the
    // file has no order dependency for a reader to preserve by accident.
    await element(by.id("downloads-screen")).scrollTo("top");

    // Addressed by testID rather than `by.text(/available/)`. Detox hands a
    // RegExp to Espresso as a pattern the whole string has to satisfy, so
    // /available/ did not match "Using 0 KB · 4.5 GB available" — it is a full
    // match, not a substring search.
    await expect(element(by.id("downloads-storage-info"))).toBeVisible();
  });

  it("shows available regions", async () => {
    // The catalogue is whatever the tile server's manifest publishes, so read
    // it rather than naming states. A hard-coded California/Florida/Texas
    // failed on every run once the live manifest was cut down to Maryland —
    // the screen was right, the test was pinned to production data.
    const names = await publishedRegionNames();
    // Detox's `expect` is the one in scope here, so check this by hand: an
    // empty manifest must fail rather than pass the loop below vacuously.
    if (names.length === 0) throw new Error("manifest lists no regions");

    // A long catalogue does not fit on screen, so scroll to each region, in
    // list order so the scrolling stays monotonic.
    for (const name of names) {
      await waitFor(element(by.text(name)))
        .toBeVisible()
        .whileElement(by.id("downloads-screen"))
        .scroll(400, "down");
    }
  });
});
