/**
 * The app calls only the Valhalla action the service is configured to allow.
 *
 * bugrout-valhalla is reachable by anyone and runs one worker thread (#289).
 * Its shipped config answers `route` and `status` and refuses every other Loki
 * action; the app must not reach for one of the refused ones.
 *
 * **Two of this file's three checks moved.** The `--loki-actions` flag in
 * `build-graph.sh` and the deliberate absence of a `[services.concurrency]`
 * cap in `fly.toml` are facts about the service, and the service moved to
 * AFixt/bugrout-server on 2026-11-15. They are pinned there, in
 * `security/tests/valhalla-public-surface.security.test.ts`. What is left here
 * is the half this repository can actually read: what the app asks for.
 *
 * The allowed set is `route,status`, and `status` is the health check's, not
 * the app's. So the app must call `route` and nothing else.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VALHALLA_MODULE = join(
  __dirname,
  "../../services/valhalla/ValhallaModule.ts",
);

describe("public Valhalla service", () => {
  it("only calls the /route action from the app", () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed path inside the repo, built from __dirname
    const source = readFileSync(VALHALLA_MODULE, "utf8");
    const actions = [...source.matchAll(/\$\{baseUrl\}\/(\w+)/g)].map(
      (m) => m[1],
    );

    expect(new Set(actions)).toEqual(new Set(["route"]));
  });
});
