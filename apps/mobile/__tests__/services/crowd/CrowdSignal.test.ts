/**
 * Tests for Crowd Signal's device-token handling (#85).
 *
 * The claim under test is the one in the module header and in the bundled
 * privacy policy: a stream of pings cannot be linked back to one device. That
 * holds only if the rotating token comes from a CSPRNG. So the behaviour that
 * matters is what happens when there is not one — the answer has to be "send
 * nothing", not "send something weaker".
 */

const mockSetPreference = jest.fn<Promise<void>, [string, string]>();
const mockGetPreference = jest.fn<Promise<string | null>, [string]>();

/** Stands in for the real CsprngUnavailableError, with a stable identity. */
class MockCsprngUnavailableError extends Error {
  constructor() {
    super("no csprng available");
    this.name = "CsprngUnavailableError";
  }
}

jest.mock("@/db/queries/preferences", () => ({
  getPreference: (key: string) => mockGetPreference(key),
  setPreference: (key: string, value: string) => mockSetPreference(key, value),
}));

jest.mock("@/platform/battery", () => ({
  getBatteryLevelAsync: () => Promise.resolve(1),
}));

import type * as CrowdSignalNamespace from "@/services/crowd/CrowdSignal";
import type * as ConnectivityStoreNamespace from "@/stores/useConnectivityStore";
import type * as SettingsStoreNamespace from "@/stores/useSettingsStore";

type CrowdSignalModule = typeof CrowdSignalNamespace;

const POSITION = { lat: 38.90723, lng: -77.03691 };

/**
 * Load CrowdSignal fresh with a chosen `secureRandomUUID`, then opt in and go
 * online. Returns the module plus the fetch spy standing in for the network.
 */
type FetchSpy = jest.Mock<Promise<Response>, [string, RequestInit]>;

function load(secureRandomUUID: () => string): {
  mod: CrowdSignalModule;
  fetchSpy: FetchSpy;
} {
  let mod: CrowdSignalModule | undefined;
  const fetchSpy: FetchSpy = jest.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(new Response("{}", { status: 200 })),
  );

  jest.isolateModules(() => {
    jest.doMock("@/platform/crypto", () => ({
      CsprngUnavailableError: MockCsprngUnavailableError,
      secureRandomUUID,
    }));
    /* eslint-disable @typescript-eslint/no-require-imports -- isolateModules needs requires to pick up the per-test crypto mock */
    mod = require("@/services/crowd/CrowdSignal") as CrowdSignalModule;
    const { useSettingsStore } =
      require("@/stores/useSettingsStore") as typeof SettingsStoreNamespace;
    const { useConnectivityStore } =
      require("@/stores/useConnectivityStore") as typeof ConnectivityStoreNamespace;
    /* eslint-enable @typescript-eslint/no-require-imports */
    useSettingsStore.getState().setCrowdSignalOptIn(true);
    useConnectivityStore.getState().setOnline(true);
  });

  if (!mod) throw new Error("failed to load CrowdSignal");
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  return { mod, fetchSpy };
}

/** A `secureRandomUUID` that behaves as it does with no CSPRNG present. */
function throwingCsprng(): () => string {
  return () => {
    throw new MockCsprngUnavailableError();
  };
}

beforeEach(() => {
  jest.resetModules();
  mockGetPreference.mockReset().mockResolvedValue(null);
  mockSetPreference.mockReset().mockResolvedValue(undefined);
});

describe("CrowdSignal — CSPRNG available", () => {
  it("sends a signal carrying the securely minted token", async () => {
    const { mod, fetchSpy } = load(
      () => "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );

    await mod.sendSignal(POSITION, 12.34, 91);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls.at(0)?.[1];
    const rawBody = typeof init?.body === "string" ? init.body : "";
    const body = JSON.parse(rawBody) as {
      token: string;
      lat: number;
      lng: number;
    };
    expect(body.token).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    // Coordinates are still rounded to ~11 m before transmission.
    expect(body.lat).toBe(38.9072);
    expect(body.lng).toBe(-77.0369);
    expect(mod.isCrowdSignalDisabled()).toBe(false);
  });
});

describe("CrowdSignal — CSPRNG unavailable", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("emits no token, makes no request, and persists nothing", async () => {
    const { mod, fetchSpy } = load(throwingCsprng());

    await mod.sendSignal(POSITION, 12.34, 91);

    expect(fetchSpy).not.toHaveBeenCalled();
    // Nothing weaker got persisted as the device token either.
    expect(mockSetPreference).not.toHaveBeenCalledWith(
      "crowd_device_token",
      expect.anything(),
    );
    expect(warn).toHaveBeenCalled();
  });

  it("stays disabled for the rest of the session", async () => {
    const { mod, fetchSpy } = load(throwingCsprng());

    await mod.sendSignal(POSITION, 12.34, 91);
    expect(mod.isCrowdSignalDisabled()).toBe(true);

    // Asserting "no request was sent" alone would NOT pin the latch: the mint
    // throws on every call, so nothing is sent whether the latch exists or
    // not, and the assertion passes either way. What the latch actually
    // changes is that later calls stop re-attempting — so count the attempts.
    const attemptsAfterFirst = mockGetPreference.mock.calls.length;

    await mod.sendSignal(POSITION, 13, 92);
    await mod.sendSignal(POSITION, 14, 93);

    expect(mockGetPreference.mock.calls.length).toBe(attemptsAfterFirst);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rotateToken does not re-enable it", async () => {
    const { mod, fetchSpy } = load(throwingCsprng());

    await mod.sendSignal(POSITION, 12.34, 91);
    await mod.rotateToken();
    await mod.sendSignal(POSITION, 12.34, 91);

    expect(mod.isCrowdSignalDisabled()).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
