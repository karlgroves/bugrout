/**
 * The native branch of ValhallaModule: in-process routing when the module is
 * built into the binary, and HTTP when it isn't (#152).
 *
 * A build that plans "native" may still lack the module (Expo Go, web, a build
 * without the config plugin) or fail to load the tiles. Either must fall back
 * to HTTP rather than leave routing dead.
 */

import { NativeModules } from "react-native";

import { RouteUnavailableError } from "@/services/routing/RouteUnavailable";
import {
  calculateRoute,
  initValhalla,
} from "@/services/valhalla/ValhallaModule";

import fixture from "./fixtures/valhalla-baltimore-route.json";

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
const DESTINATION = { lat: 39.3138, lng: -76.6021 };
const ARCHIVE = "file:///docs/tiles/md/md.valhalla.tar.gz";

const modules = NativeModules as { ValhallaEngine?: unknown };
const originalFetch = global.fetch;
const originalUrl = process.env.EXPO_PUBLIC_VALHALLA_URL;
let fetchSpy: jest.Mock<Promise<Response>, []>;
let warn: jest.SpyInstance;

/** Install a ValhallaEngine native module built from these functions. */
function nativeEngine(
  init: (tileDir: string) => Promise<void>,
  route: (request: string) => Promise<string>,
): {
  init: jest.Mock<Promise<void>, [string]>;
  route: jest.Mock<Promise<string>, [string]>;
} {
  const engine = { init: jest.fn(init), route: jest.fn(route) };
  modules.ValhallaEngine = engine;
  return engine;
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_VALHALLA_URL = "https://valhalla.test";
  fetchSpy = jest.fn(() =>
    Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
  );
  global.fetch = fetchSpy as typeof fetch;
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  delete modules.ValhallaEngine;
  global.fetch = originalFetch;
  warn.mockRestore();
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_VALHALLA_URL;
  else process.env.EXPO_PUBLIC_VALHALLA_URL = originalUrl;
});

describe("native approach with the module built in", () => {
  it("loads the region archive and routes in-process, not over HTTP", async () => {
    const engine = nativeEngine(
      () => Promise.resolve(),
      () => Promise.resolve(JSON.stringify(fixture)),
    );

    await initValhalla({ tileDir: ARCHIVE, approach: "native" });
    const route = await calculateRoute(BALTIMORE, DESTINATION);

    expect(engine.init).toHaveBeenCalledWith(ARCHIVE);
    expect(engine.route).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(engine.route.mock.calls[0]?.[0])) as {
      locations: { lat: number; lon: number }[];
    };
    expect(request.locations[0]).toMatchObject({ lat: 39.2904, lon: -76.6122 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(route.legs.length).toBeGreaterThan(0);
  });

  it("reports a native routing failure as unavailable, not a made-up route", async () => {
    nativeEngine(
      () => Promise.resolve(),
      () => Promise.reject(new Error("no path")),
    );
    await initValhalla({ tileDir: ARCHIVE, approach: "native" });

    await expect(calculateRoute(BALTIMORE, DESTINATION)).rejects.toMatchObject({
      reason: "server_error",
    });
    await expect(calculateRoute(BALTIMORE, DESTINATION)).rejects.toBeInstanceOf(
      RouteUnavailableError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("native approach falling back to HTTP", () => {
  it("routes over HTTP when the module isn't in this binary", async () => {
    await initValhalla({ tileDir: ARCHIVE, approach: "native" });
    await calculateRoute(BALTIMORE, DESTINATION);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://valhalla.test/route",
      expect.anything(),
    );
  });

  it("routes over HTTP when the module can't load the tiles", async () => {
    const engine = nativeEngine(
      () => Promise.reject(new Error("tar unreadable")),
      () => Promise.resolve(JSON.stringify(fixture)),
    );

    await initValhalla({ tileDir: ARCHIVE, approach: "native" });
    await calculateRoute(BALTIMORE, DESTINATION);

    expect(engine.route).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it("ignores a module without both init and route", async () => {
    // init would succeed, so without the shape check this module would be
    // adopted and every route would then fail calling the missing route().
    modules.ValhallaEngine = {
      init: () => Promise.resolve(),
      route: "not a function",
    };

    await initValhalla({ tileDir: ARCHIVE, approach: "native" });
    await calculateRoute(BALTIMORE, DESTINATION);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("http approach", () => {
  it("never calls the native module, even when it is built in", async () => {
    const engine = nativeEngine(
      () => Promise.resolve(),
      () => Promise.resolve(JSON.stringify(fixture)),
    );

    await initValhalla({ tileDir: ARCHIVE, approach: "http" });
    await calculateRoute(BALTIMORE, DESTINATION);

    expect(engine.init).not.toHaveBeenCalled();
    expect(engine.route).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
