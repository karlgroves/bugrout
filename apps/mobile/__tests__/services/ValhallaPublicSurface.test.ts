/**
 * The public routing service exposes only what the app uses.
 *
 * bugrout-valhalla is reachable by anyone and runs one worker thread (#289).
 * The shipped config must refuse Valhalla actions the app never calls.
 *
 * fly.toml must NOT cap concurrent connections: valhalla_service never closes
 * an idle keep-alive connection, so pooled connections from a few devices
 * would fill the cap and lock everyone else out at low load.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SERVICE_DIR = join(__dirname, "../../../../backend/services/valhalla");
const VALHALLA_MODULE = join(
  __dirname,
  "../../services/valhalla/ValhallaModule.ts",
);

function read(path: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed paths inside the repo, built from __dirname
  return readFileSync(path, "utf8");
}

describe("public Valhalla service", () => {
  it("ships a config that allows only the actions the app and health check use", () => {
    // The argument itself, not the comment that explains it.
    const match = /^\s*--loki-actions\s+(\S+)\s*$/m.exec(
      read(join(SERVICE_DIR, "build-graph.sh")),
    );

    expect(match).not.toBeNull();
    expect(match?.[1]?.split(",").sort()).toEqual(["route", "status"]);
  });

  it("only calls the /route action from the app", () => {
    const actions = [
      ...read(VALHALLA_MODULE).matchAll(/\$\{baseUrl\}\/(\w+)/g),
    ].map((m) => m[1]);

    expect(new Set(actions)).toEqual(new Set(["route"]));
  });

  it("does not cap connections while idle keep-alive connections count", () => {
    const toml = read(join(SERVICE_DIR, "fly.toml"));

    // Strip comments so the explanation in fly.toml does not count.
    const config = toml.replace(/#.*$/gm, "");
    expect(config).not.toMatch(/\[services\.concurrency\]/);
    expect(config).not.toMatch(/hard_limit|soft_limit/);
  });
});
