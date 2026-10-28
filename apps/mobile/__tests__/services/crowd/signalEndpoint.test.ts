/**
 * Where Crowd Signal POSTs its signals is a deployment detail (#144).
 *
 * `signal.bugrout.app` has never resolved — NXDOMAIN on 2026-09-30,
 * 2026-10-22 and again on 2026-10-28 — and it was written into
 * `CrowdSignal.ts` as a literal, so deploying the worker would not have been
 * enough to make the feature work: it would also have needed a code change and
 * a release. Every other backend origin in the app is already read from the
 * environment (`EXPO_PUBLIC_TILE_SERVER_URL`, `EXPO_PUBLIC_VALHALLA_URL`).
 *
 * Two things have to hold, and they pull in opposite directions, which is why
 * both are pinned here:
 *
 *   - the variable is honoured, so pointing the app at a deployed worker is an
 *     `eas.json` edit;
 *   - the fallback and the value in `eas.json` agree, so a build that falls
 *     back — a plain `expo start`, the simulator profile — calls the same host
 *     as a build that does not. `security/tests/tile-origin.security.test.ts`
 *     exists because the tile origin drifted exactly that way (#158): every
 *     fallback named a hostname that had never resolved, and nothing reported
 *     it because each file was internally consistent.
 */
/* eslint-disable security/detect-non-literal-fs-filename -- reads this repository's own eas.json from a fixed path */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockSetPreference = jest.fn<Promise<void>, [string, string]>();
const mockGetPreference = jest.fn<Promise<string | null>, [string]>();

jest.mock("@/db/queries/preferences", () => ({
  getPreference: (key: string) => mockGetPreference(key),
  setPreference: (key: string, value: string) => mockSetPreference(key, value),
}));

jest.mock("@/platform/battery", () => ({
  getBatteryLevelAsync: () => Promise.resolve(0.9),
}));

jest.mock("@/platform/crypto", () => ({
  CsprngUnavailableError: class extends Error {},
  secureRandomUUID: () => "11111111-2222-3333-4444-555555555555",
}));

import type * as CrowdSignalNamespace from "@/services/crowd/CrowdSignal";
import type * as ConnectivityStoreNamespace from "@/stores/useConnectivityStore";
import type * as SettingsStoreNamespace from "@/stores/useSettingsStore";

const POSITION = { lat: 38.90723, lng: -77.03691 };

type FetchSpy = jest.Mock<Promise<Response>, [string, RequestInit]>;

/**
 * Send one signal with `EXPO_PUBLIC_SIGNAL_URL` set as given, and report the
 * URL the request went to.
 *
 * The constant is read at module scope, so the variable has to be in place
 * before the module is required — hence the isolated require rather than an
 * import at the top.
 *
 * @param signalUrl - The value to set, or undefined to leave it unset.
 * @returns The URL `fetch` was called with.
 */
async function postedUrl(signalUrl: string | undefined): Promise<string> {
  const before = process.env.EXPO_PUBLIC_SIGNAL_URL;
  if (signalUrl === undefined) delete process.env.EXPO_PUBLIC_SIGNAL_URL;
  else process.env.EXPO_PUBLIC_SIGNAL_URL = signalUrl;

  const fetchSpy: FetchSpy = jest.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(new Response("{}", { status: 200 })),
  );
  global.fetch = fetchSpy as unknown as typeof fetch;

  let mod: typeof CrowdSignalNamespace | undefined;
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports -- isolateModules needs requires to re-read process.env at module scope */
    mod =
      require("@/services/crowd/CrowdSignal") as typeof CrowdSignalNamespace;
    const { useSettingsStore } =
      require("@/stores/useSettingsStore") as typeof SettingsStoreNamespace;
    const { useConnectivityStore } =
      require("@/stores/useConnectivityStore") as typeof ConnectivityStoreNamespace;
    /* eslint-enable @typescript-eslint/no-require-imports */
    useSettingsStore.getState().setCrowdSignalOptIn(true);
    useSettingsStore.getState().setDemoLocation(false);
    useConnectivityStore.getState().setOnline(true);
  });
  if (!mod) throw new Error("failed to load CrowdSignal");

  mockGetPreference.mockResolvedValue(null);
  mockSetPreference.mockResolvedValue(undefined);
  await mod.sendSignal(POSITION, 20, 90);

  if (before === undefined) delete process.env.EXPO_PUBLIC_SIGNAL_URL;
  else process.env.EXPO_PUBLIC_SIGNAL_URL = before;

  const url = fetchSpy.mock.calls[0]?.[0];
  if (url === undefined) throw new Error("no signal was sent");
  return url;
}

/** The origin the shipped app calls: the production profile's value. */
const shippedOrigin = (() => {
  interface EasConfig {
    build: Record<string, { env?: Record<string, string> }>;
  }
  const eas = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "..", "eas.json"), "utf8"),
  ) as EasConfig;
  const url = eas.build.production?.env?.EXPO_PUBLIC_SIGNAL_URL;
  if (!url)
    throw new Error("eas.json production sets no EXPO_PUBLIC_SIGNAL_URL");
  return url;
})();

describe("the crowd signal endpoint", () => {
  it("is taken from EXPO_PUBLIC_SIGNAL_URL when it is set", async () => {
    const url = await postedUrl(
      "https://bugrout-crowd-signal.example.workers.dev",
    );

    expect(url).toBe(
      "https://bugrout-crowd-signal.example.workers.dev/v1/signal",
    );
  });

  it("keeps the path, so only the origin is configurable", async () => {
    const url = await postedUrl("https://signal.example");

    expect(new URL(url).pathname).toBe("/v1/signal");
  });

  it("falls back to the same origin eas.json ships, so a fallback build agrees", async () => {
    const url = await postedUrl(undefined);

    expect(url).toBe(`${shippedOrigin}/v1/signal`);
  });
});
