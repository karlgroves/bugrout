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
