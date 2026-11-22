/**
 * The app's exclude-polygon budget matches the routing engine's limit.
 *
 * Valhalla rejects a whole route request whose exclude_polygons exceed
 * `service_limits.max_exclude_polygons_length`. If the app's budget were larger
 * than the engine's, every heavily threatened route would be refused — and the
 * app does not retry without the polygons, so a driver fleeing a fire would
 * get no route at all. If smaller, threats the engine could avoid would be
 * dropped.
 *
 * There are two engines, so two limits:
 *
 * - **The in-process engine** (#385) sets the limit in `makeConfig` in
 *   `native-modules/valhalla/cpp/ValhallaCore.cpp`. That file is in this
 *   repository, so it is read and compared directly. It once kept Valhalla's
 *   default of 10 000 m while the app budgeted 250 000 m — caught in review,
 *   not by a test, which is why this one now reads it.
 * - **The Fly routing service** is built with
 *   `--service-limits-max-exclude-polygons-length` in `build-graph.sh`, which
 *   moved to AFixt/bugrout-server on 2026-11-15. No test can read across the
 *   two repositories, so the pair is pinned from both ends:
 *   this test pins the app constant to the literal below, and
 *   `security/tests/valhalla-public-surface.security.test.ts` in the server
 *   repository pins the build flag to the same figure. That is weaker than
 *   reading both — a change to one repository alone still passes its own
 *   gate — so the number appears in this docblock as well, where a reviewer of
 *   either change will see it.
 *
 * **250000 metres**, in all three places. Changing it means changing all three.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- a fixed path inside the repo, built from __dirname */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MAX_EXCLUDE_POLYGONS_PERIMETER_M } from "@/services/routing/AvoidanceBudget";

/** The limit the Fly Valhalla graph is built with, in metres. */
const GRAPH_MAX_EXCLUDE_POLYGONS_LENGTH_M = 250_000;

const VALHALLA_CORE = join(
  __dirname,
  "../../native-modules/valhalla/cpp/ValhallaCore.cpp",
);

describe("exclude-polygon limit", () => {
  it("is the 250 000 m the Valhalla graph is built with", () => {
    expect(MAX_EXCLUDE_POLYGONS_PERIMETER_M).toBe(
      GRAPH_MAX_EXCLUDE_POLYGONS_LENGTH_M,
    );
  });

  it("matches the limit the in-process engine is configured with", () => {
    // Comments stripped, so the explanation beside the call does not count.
    const source = readFileSync(VALHALLA_CORE, "utf8").replace(
      /\/\/[^\n]*/g,
      "",
    );
    const match =
      /config\.put\(\s*"service_limits\.max_exclude_polygons_length"\s*,\s*(\d+)\s*\)/.exec(
        source,
      );

    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(MAX_EXCLUDE_POLYGONS_PERIMETER_M);
  });
});
