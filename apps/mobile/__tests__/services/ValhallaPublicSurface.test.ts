/**
 * The public routing service exposes only what the app uses, behind a cap.
 *
 * bugrout-valhalla is reachable by anyone and runs one worker thread (#289).
 * The shipped config must refuse Valhalla actions the app never calls, and
 * fly.toml must cap concurrent connections so a flood cannot queue without
 * bound behind that thread.
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

  it("caps concurrent connections to the machine", () => {
    const toml = read(join(SERVICE_DIR, "fly.toml"));
    const block = /\[services\.concurrency\]([\s\S]*?)(?=\n\s*\[|$)/.exec(toml);

    expect(block).not.toBeNull();
    const body = block?.[1] ?? "";
    // The tls handler passes bytes through; Fly can only count connections.
    expect(body).toMatch(/type\s*=\s*'connections'/);
    const hard = Number(/hard_limit\s*=\s*(\d+)/.exec(body)?.[1]);
    const soft = Number(/soft_limit\s*=\s*(\d+)/.exec(body)?.[1]);
    expect(hard).toBeGreaterThan(0);
    expect(soft).toBeGreaterThan(0);
    expect(soft).toBeLessThanOrEqual(hard);
  });
});
