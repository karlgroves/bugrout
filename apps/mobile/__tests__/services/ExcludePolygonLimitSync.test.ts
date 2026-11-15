/**
 * The app's exclude-polygon budget matches the routing engine's limit.
 *
 * Valhalla rejects a whole route request whose exclude_polygons exceed
 * `service_limits.max_exclude_polygons_length`. If the app's budget were larger
 * than the server's, every heavily threatened route would 400 and fall back to
 * a mock route; if smaller, threats the server could avoid would be dropped.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MAX_EXCLUDE_POLYGONS_PERIMETER_M } from "@/services/routing/AvoidanceBudget";

// The graph build writes the limit into the artifact's valhalla.json (#266).
const BUILD_GRAPH = join(
  __dirname,
  "../../../../backend/services/valhalla/build-graph.sh",
);

describe("exclude-polygon limit", () => {
  it("matches the limit the Valhalla graph is built with", () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed path inside the repo, built from __dirname
    const script = readFileSync(BUILD_GRAPH, "utf8");
    const match = /--service-limits-max-exclude-polygons-length\s+(\d+)/.exec(
      script,
    );

    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(MAX_EXCLUDE_POLYGONS_PERIMETER_M);
  });
});
