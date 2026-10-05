/**
 * Every routing failure reaches crash reporting, with enough context to tell
 * the kinds apart, and without the user's whereabouts (#169).
 *
 * #141 had real routing down for about five and a half months with nothing
 * reporting it. Each failure branch is driven here through the public
 * calculateRoute(), against response shapes the live service gives.
 */

import { NativeModules } from "react-native";

import { captureError } from "@/services/CrashReporting";
import {
  calculateRoute,
  initValhalla,
} from "@/services/valhalla/ValhallaModule";
import { useConnectivityStore } from "@/stores/useConnectivityStore";

import fixture from "./fixtures/valhalla-baltimore-route.json";

jest.mock("@/services/CrashReporting", () => ({ captureError: jest.fn() }));

const mockCaptureError = captureError as jest.MockedFunction<
  typeof captureError
>;

const BALTIMORE = { lat: 39.2904, lng: -76.6122 };
const LOUISVILLE = { lat: 38.25424, lng: -85.75941 };

const originalFetch = global.fetch;
const originalUrl = process.env.EXPO_PUBLIC_VALHALLA_URL;

/** Serve every routing request with `respond`. */
function serve(respond: () => Promise<Response>): void {
  global.fetch = jest.fn(respond) as typeof fetch;
}

/** Route Baltimore → Louisville, swallow the failure, return what was reported. */
async function reported(): Promise<Record<string, unknown>> {
  await calculateRoute(BALTIMORE, LOUISVILLE).catch(() => undefined);
  expect(mockCaptureError).toHaveBeenCalledTimes(1);
  const context = mockCaptureError.mock.calls[0]?.[1] as
    { routing: Record<string, unknown> } | undefined;
  return context?.routing ?? {};
}

beforeEach(async () => {
  mockCaptureError.mockClear();
  process.env.EXPO_PUBLIC_VALHALLA_URL = "https://valhalla.test";
  useConnectivityStore.getState().setOnline(true);
  await initValhalla({ tileDir: "", approach: "http" });
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_VALHALLA_URL;
  else process.env.EXPO_PUBLIC_VALHALLA_URL = originalUrl;
});

describe("routing failure telemetry", () => {
  it("reports a destination off the graph with Valhalla's code and message", async () => {
    serve(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error_code: 171,
            error: "No suitable edges near location",
            status_code: 400,
          }),
          { status: 400 },
        ),
      ),
    );

    expect(await reported()).toEqual({
      reason: "out_of_coverage",
      approach: "http",
      deviceOnline: true,
      httpStatus: 400,
      valhallaCode: 171,
      valhallaMessage: "No suitable edges near location",
    });
  });

  it("marks a #141-type rejection: an HTTP error with no Valhalla code", async () => {
    // What prime_server sent back for every request behind Fly's proxy.
    serve(() =>
      Promise.resolve(new Response("Malformed HTTP request", { status: 400 })),
    );

    expect(await reported()).toMatchObject({
      reason: "server_error",
      httpStatus: 400,
      valhallaCode: null,
    });
  });

  it("reports an unreachable service, and whether the device itself was online", async () => {
    serve(() => Promise.reject(new TypeError("Network request failed")));

    expect(await reported()).toMatchObject({
      reason: "offline",
      deviceOnline: true,
      httpStatus: null,
    });

    mockCaptureError.mockClear();
    useConnectivityStore.getState().setOnline(false);
    expect(await reported()).toMatchObject({
      reason: "offline",
      deviceOnline: false,
    });
  });

  it("reports which approach failed", async () => {
    (NativeModules as { ValhallaEngine?: unknown }).ValhallaEngine = {
      init: () => Promise.resolve(),
      route: () => Promise.reject(new Error("native engine crashed")),
    };
    await initValhalla({ tileDir: "x.tar.gz", approach: "native" });

    expect(await reported()).toMatchObject({
      reason: "server_error",
      approach: "native",
    });
    delete (NativeModules as { ValhallaEngine?: unknown }).ValhallaEngine;
  });

  it("cuts a long Valhalla message", async () => {
    serve(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error_code: 999, error: "x".repeat(500) }),
          { status: 400 },
        ),
      ),
    );

    expect(String((await reported()).valhallaMessage)).toHaveLength(120);
  });

  it("never sends where the user is or is going", async () => {
    serve(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error_code: 171 }), { status: 400 }),
      ),
    );
    await calculateRoute(BALTIMORE, LOUISVILLE).catch(() => undefined);

    // Something was reported, so "no coordinates" below isn't vacuous.
    expect(mockCaptureError).toHaveBeenCalledTimes(1);
    const [error, context] = mockCaptureError.mock.calls[0] ?? [];
    const sent = `${String(error?.message)} ${JSON.stringify(context)}`;
    for (const coordinate of ["39.29", "76.61", "38.25", "85.75"]) {
      expect(sent).not.toContain(coordinate);
    }
  });

  it("reports nothing when a route comes back", async () => {
    serve(() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 })),
    );

    await calculateRoute(BALTIMORE, { lat: 39.3138, lng: -76.6021 });
    expect(mockCaptureError).not.toHaveBeenCalled();
  });
});
