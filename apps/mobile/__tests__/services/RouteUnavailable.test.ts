/**
 * Routing never invents a route (#190).
 *
 * Every failure used to become a made-up straight-line route with a distance,
 * an ETA and turn-by-turn instructions, indistinguishable from a real one —
 * Baltimore → Louisville got a 14h 50m "route" when the engine had no road data
 * past the Maryland line. Each way routing can fail now rejects with a reason,
 * checked here through the public calculateRoute() against the responses the
 * live routing server actually gives.
 */

import {
  RouteUnavailableError,
  routeUnavailableMessage,
} from "@/services/routing/RouteUnavailable";
import {
  calculateRoute,
  initValhalla,
} from "@/services/valhalla/ValhallaModule";

import fixture from "./fixtures/valhalla-baltimore-route.json";

import type { RouteUnavailableReason } from "@/services/routing/RouteUnavailable";
import type * as ValhallaModule from "@/services/valhalla/ValhallaModule";

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
const LOUISVILLE = { lat: 38.25424, lng: -85.75941 };

/** Serve every routing request with `respond`. */
function serve(respond: () => Promise<Response>): void {
  global.fetch = jest.fn(respond) as typeof fetch;
}

/** The reason calculateRoute rejected with, failing if it resolved. */
async function reasonFor(): Promise<RouteUnavailableReason> {
  try {
    await calculateRoute(BALTIMORE, LOUISVILLE);
  } catch (err) {
    if (err instanceof RouteUnavailableError) return err.reason;
    throw err;
  }
  throw new Error("calculateRoute resolved: a route was made up");
}

describe("calculateRoute failures", () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.EXPO_PUBLIC_VALHALLA_URL;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_VALHALLA_URL = "https://valhalla.test";
    await initValhalla({ tileDir: "", approach: "http" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_VALHALLA_URL;
    else process.env.EXPO_PUBLIC_VALHALLA_URL = originalUrl;
  });

  it("reports a destination off the road graph as out of coverage", async () => {
    // Verbatim what bugrout-valhalla.fly.dev returns for Baltimore → Louisville.
    serve(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error_code: 171,
            error: "No suitable edges near location",
            status_code: 400,
            status: "Bad Request",
          }),
          { status: 400 },
        ),
      ),
    );
    expect(await reasonFor()).toBe("out_of_coverage");
  });

  it.each([170, 442, 443])(
    "reports error %i (no path between covered points) as no_path",
    async (code) => {
      serve(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error_code: code }), { status: 400 }),
        ),
      );
      expect(await reasonFor()).toBe("no_path");
    },
  );

  it("reports an unreachable service as offline", async () => {
    serve(() => Promise.reject(new TypeError("Network request failed")));
    expect(await reasonFor()).toBe("offline");
  });

  it("reports a server error as server_error", async () => {
    serve(() =>
      Promise.resolve(new Response("upstream timeout", { status: 502 })),
    );
    expect(await reasonFor()).toBe("server_error");
  });

  it("reports an unreadable response as server_error, not a partial route", async () => {
    serve(() => Promise.resolve(new Response("{ not json", { status: 200 })));
    expect(await reasonFor()).toBe("server_error");
  });

  it("rejects a maneuver pointing outside its leg's shape instead of guessing", async () => {
    const broken = structuredClone(fixture);
    const firstLeg = broken.trip.legs[0];
    const firstManeuver = firstLeg?.maneuvers[0];
    if (!firstManeuver) throw new Error("fixture has no maneuvers");
    firstManeuver.begin_shape_index = 1_000_000;
    serve(() =>
      Promise.resolve(new Response(JSON.stringify(broken), { status: 200 })),
    );
    expect(await reasonFor()).toBe("server_error");
  });

  it("returns the real route when the service answers", async () => {
    serve(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    );
    const route = await calculateRoute(BALTIMORE, LOUISVILLE);
    expect(route.legs).toHaveLength(2);
  });
});

describe("calculateRoute before initValhalla", () => {
  it("rejects as not_ready rather than inventing a route", async () => {
    // A fresh module instance, never initialised.
    let fresh: typeof ValhallaModule | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a synchronous load to get an uninitialised instance
      fresh = require("@/services/valhalla/ValhallaModule") as typeof fresh;
    });
    if (!fresh) throw new Error("module did not load");

    await expect(
      fresh.calculateRoute(BALTIMORE, LOUISVILLE),
    ).rejects.toMatchObject({
      name: "RouteUnavailableError",
      reason: "not_ready",
    });
  });
});

describe("routeUnavailableMessage", () => {
  const reasons: RouteUnavailableReason[] = [
    "out_of_coverage",
    "no_path",
    "offline",
    "server_error",
    "not_ready",
  ];

  it.each(reasons)(
    "tells the user to follow official routes (%s)",
    (reason) => {
      const { body } = routeUnavailableMessage(
        new RouteUnavailableError(reason, "test"),
      );
      expect(body).toContain("Follow official evacuation routes");
    },
  );

  it("offers Offline Maps only when missing road data is the problem", () => {
    for (const reason of reasons) {
      const { suggestDownloads } = routeUnavailableMessage(
        new RouteUnavailableError(reason, "test"),
      );
      expect(suggestDownloads).toBe(reason === "out_of_coverage");
    }
  });

  it("gives each reason its own title", () => {
    const titles = reasons.map(
      (r) =>
        routeUnavailableMessage(new RouteUnavailableError(r, "test")).title,
    );
    expect(new Set(titles).size).toBe(reasons.length);
  });

  it("treats an unexpected error as a routing failure, not a crash", () => {
    expect(routeUnavailableMessage(new Error("boom")).title).toBe(
      "Routing failed",
    );
  });
});
