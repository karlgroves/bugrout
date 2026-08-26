/**
 * Tests for crash-report redaction.
 *
 * The module used to claim "No PII is transmitted" with nothing enforcing it.
 * These assert the mechanism that now backs the claim — chiefly that a context
 * carrying coordinates cannot reach Sentry intact.
 */

import * as Sentry from "@/platform/sentry";
import {
  captureError,
  redactSensitive,
  scrubEvent,
} from "@/services/CrashReporting";

// Hoisted above the imports by babel-plugin-jest-hoist, so the mock is in place
// before CrashReporting resolves its `@/platform/sentry` binding.
jest.mock("@/platform/sentry", () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
}));

describe("redactSensitive", () => {
  it("redacts bare coordinate keys", () => {
    expect(redactSensitive({ lat: 37.77, lng: -122.41 })).toEqual({
      lat: "[redacted]",
      lng: "[redacted]",
    });
  });

  it("redacts prefixed and suffixed coordinate keys", () => {
    expect(
      redactSensitive({
        destLat: 37.77,
        origin_latitude: 1,
        currentLocation: "x",
      }),
    ).toEqual({
      destLat: "[redacted]",
      origin_latitude: "[redacted]",
      currentLocation: "[redacted]",
    });
  });

  it("redacts a nested destination object whole, not field by field", () => {
    expect(
      redactSensitive({ route: { destination: { lat: 1, lng: 2 } } }),
    ).toEqual({ route: { destination: "[redacted]" } });
  });

  it("redacts inside arrays", () => {
    expect(redactSensitive([{ lat: 1 }, { safe: "keep" }])).toEqual([
      { lat: "[redacted]" },
      { safe: "keep" },
    ]);
  });

  it("redacts the rotating crowd-signal token", () => {
    expect(redactSensitive({ token: "abc-123" })).toEqual({
      token: "[redacted]",
    });
  });

  it("redacts contact details", () => {
    expect(
      redactSensitive({ email: "a@b.c", phoneNumber: "555", contacts: [] }),
    ).toEqual({
      email: "[redacted]",
      phoneNumber: "[redacted]",
      contacts: "[redacted]",
    });
  });

  it("leaves non-sensitive diagnostic values untouched", () => {
    const input = {
      screen: "navigation",
      batteryLevel: 0.42,
      isOffline: true,
      tileCount: 12,
      regionId: "bay-area",
    };
    expect(redactSensitive(input)).toEqual(input);
  });

  it("passes primitives through unchanged", () => {
    expect(redactSensitive("plain")).toBe("plain");
    expect(redactSensitive(7)).toBe(7);
    expect(redactSensitive(null)).toBeNull();
  });

  it("replaces a subtree it cannot finish inspecting", () => {
    let deep: Record<string, unknown> = { lat: 1 };
    for (let i = 0; i < 12; i += 1) {
      deep = { nested: deep };
    }
    expect(JSON.stringify(redactSensitive(deep))).not.toContain('"lat":1');
  });

  it("does not mutate its input", () => {
    const input = { lat: 37.77 };
    redactSensitive(input);
    expect(input.lat).toBe(37.77);
  });
});

describe("scrubEvent — the beforeSend hook", () => {
  it("scrubs contexts, extra and user", () => {
    const event = {
      message: "boom",
      contexts: { app_state: { destination: { lat: 1, lng: 2 } } },
      extra: { homeAddress: "1 Main St" },
      user: { email: "a@b.c" },
    };
    const out = scrubEvent(event);
    expect(JSON.stringify(out)).not.toContain("1 Main St");
    expect(JSON.stringify(out)).not.toContain("a@b.c");
    expect(out.contexts).toEqual({ app_state: { destination: "[redacted]" } });
  });

  it("leaves the rest of the event alone", () => {
    expect(scrubEvent({ message: "boom", level: "error" })).toEqual({
      message: "boom",
      level: "error",
    });
  });

  it("does not invent fields that were absent", () => {
    expect(Object.keys(scrubEvent({ message: "boom" }))).toEqual(["message"]);
  });
});

describe("captureError", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("redacts coordinates before they reach setContext", () => {
    captureError(new Error("nav failed"), {
      screen: "navigation",
      destination: { lat: 37.77, lng: -122.41 },
    });
    expect(Sentry.setContext).toHaveBeenCalledWith("app_state", {
      screen: "navigation",
      destination: "[redacted]",
    });
  });

  it("still reports the exception", () => {
    const err = new Error("nav failed");
    captureError(err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
    expect(Sentry.setContext).not.toHaveBeenCalled();
  });
});

describe("initCrashReporting — the redaction is actually wired up", () => {
  // These matter because scrubEvent's whole job is to catch events this module
  // never sees — ones Sentry generates itself. Asserting the function works
  // does not assert it is installed, and deleting `beforeSend: scrubEvent`
  // from Sentry.init passed every other test in this file.
  const ORIGINAL_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

  afterEach(() => {
    if (ORIGINAL_DSN === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    else process.env.EXPO_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
    jest.resetModules();
  });

  /**
   * Re-import the module with a DSN configured, so init actually runs.
   *
   * The DSN is read at module load, so it has to be set before the require.
   *
   * @returns The freshly loaded module and its Sentry mock.
   */
  function loadWithDsn(): {
    init: jest.MockedFunction<(options: Record<string, unknown>) => void>;
    initCrashReporting: (...args: never[]) => void;
  } {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://public@example.ingest/1";
    let loaded!: { initCrashReporting: (...args: never[]) => void };
    let sentry!: {
      init: jest.MockedFunction<(options: Record<string, unknown>) => void>;
    };
    jest.isolateModules(() => {
      sentry = jest.requireMock("@/platform/sentry");
      loaded = jest.requireActual("@/services/CrashReporting");
    });
    return { init: sentry.init, initCrashReporting: loaded.initCrashReporting };
  }

  it("installs a beforeSend hook", () => {
    const { init, initCrashReporting } = loadWithDsn();
    init.mockClear();

    initCrashReporting();

    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0]?.[0];
    expect(typeof options?.beforeSend).toBe("function");
  });

  it("the installed hook is one that actually redacts", () => {
    const { init, initCrashReporting } = loadWithDsn();
    init.mockClear();

    initCrashReporting();

    const beforeSend = init.mock.calls[0]?.[0]?.beforeSend as (
      e: Record<string, unknown>,
    ) => Record<string, unknown>;
    const scrubbed = beforeSend({
      contexts: { app_state: { destination: { lat: 37.77, lng: -122.41 } } },
    });
    expect(JSON.stringify(scrubbed)).not.toContain("37.77");
    expect(JSON.stringify(scrubbed)).toContain("[redacted]");
  });

  it("turns off Sentry's default PII collection", () => {
    const { init, initCrashReporting } = loadWithDsn();
    init.mockClear();

    initCrashReporting();

    expect(init.mock.calls[0]?.[0]?.sendDefaultPii).toBe(false);
  });
});
