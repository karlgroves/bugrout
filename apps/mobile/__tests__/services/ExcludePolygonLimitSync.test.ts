/**
 * The app's exclude-polygon budget matches the routing engine's limit.
 *
 * Valhalla rejects a whole route request whose exclude_polygons exceed
 * `service_limits.max_exclude_polygons_length`. If the app's budget were larger
 * than the engine's, every heavily threatened route would 400 and fall back to
 * a mock route; if smaller, threats the engine could avoid would be dropped.
 *
 * **This check used to read the other side of the pair.** It opened
 * `backend/services/valhalla/build-graph.sh` and compared the app constant
 * against the `--service-limits-max-exclude-polygons-length` flag the graph is
 * built with. That script moved to AFixt/bugrout-server on 2026-11-15, and no
 * test in one repository can read a file in the other.
 *
 * So the pair is now pinned from both ends, with the number written down in
 * each: this test pins the app constant, and
 * `security/tests/valhalla-public-surface.security.test.ts` in the server
 * repository pins the build flag to the same figure. That is weaker
 * than reading both — a change to one repository alone still passes its own
 * gate — so the number appears in this docblock as well, where a reviewer of
 * either change will see it.
 *
 * **250000 metres**, in both places. Changing it means changing both, and the
 * in-process iOS engine's config too (#385).
 */
import { MAX_EXCLUDE_POLYGONS_PERIMETER_M } from "@/services/routing/AvoidanceBudget";

/** The limit the Valhalla graph is built with, in metres. */
const GRAPH_MAX_EXCLUDE_POLYGONS_LENGTH_M = 250_000;

describe("exclude-polygon limit", () => {
  it("is the 250 000 m the Valhalla graph is built with", () => {
    expect(MAX_EXCLUDE_POLYGONS_PERIMETER_M).toBe(
      GRAPH_MAX_EXCLUDE_POLYGONS_LENGTH_M,
    );
  });
});
