/**
 * timeoutSignal() and the Hermes runtime it exists for.
 *
 * React Native's AbortSignal (abort-controller@3) has no static `timeout`, so
 * `AbortSignal.timeout(ms)` threw on device before any request was made. Jest
 * runs on Node, which does have it — so these tests remove it to reproduce the
 * device runtime rather than trusting Node's.
 */
import { fetchManifest } from "@/services/tiles/TileManager";
import { timeoutSignal } from "@/utils/abort";

describe("timeoutSignal", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("aborts once the timeout elapses, and not before", () => {
    const signal = timeoutSignal(1000);
    expect(signal.aborted).toBe(false);

    jest.advanceTimersByTime(999);
    expect(signal.aborted).toBe(false);

    jest.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
  });
});

describe("network calls on a runtime without AbortSignal.timeout (Hermes)", () => {
  const originalTimeout = Object.getOwnPropertyDescriptor(
    AbortSignal,
    "timeout",
  );
  const originalFetch = global.fetch;

  beforeEach(() => {
    // What React Native's polyfill provides: no static timeout().
    Reflect.deleteProperty(AbortSignal, "timeout");
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ regions: [{ id: "md", name: "Maryland" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as typeof fetch;
  });

  afterEach(() => {
    if (originalTimeout) {
      Object.defineProperty(AbortSignal, "timeout", originalTimeout);
    }
    global.fetch = originalFetch;
  });

  it("the simulated runtime really lacks AbortSignal.timeout", () => {
    expect((AbortSignal as { timeout?: unknown }).timeout).toBeUndefined();
  });

  it("still fetches the offline-map manifest", async () => {
    const regions = await fetchManifest();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(regions.map((r) => r.id)).toEqual(["md"]);
  });
});
