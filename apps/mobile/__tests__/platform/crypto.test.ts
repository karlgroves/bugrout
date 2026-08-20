/**
 * Tests for the crypto platform shim (#85).
 *
 * The property under test is the one the Crowd Signal unlinkability guarantee
 * rests on: `secureRandomUUID()` must come from a CSPRNG or throw. It must
 * never quietly hand back a `Math.random()` value, which is what the previous
 * implementation did on web and on any `expo-crypto` require failure.
 *
 * Each block re-imports the module under `jest.isolateModules` so the mocked
 * environment is picked up at require time.
 */

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

import type * as CryptoModuleNamespace from "@/platform/crypto";

type CryptoModule = typeof CryptoModuleNamespace;

/** Load platform/crypto fresh, so module-level environment probes re-run. */
function loadCrypto(): CryptoModule {
  let mod: CryptoModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a require to pick up the per-test mocks
    mod = require("@/platform/crypto") as CryptoModule;
  });
  if (!mod) throw new Error("failed to load @/platform/crypto");
  return mod;
}

describe("secureRandomUUID — with expo-crypto available", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock("expo-crypto", () => ({
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
    }));
  });

  afterEach(() => {
    jest.dontMock("expo-crypto");
  });

  it("uses expo-crypto's randomUUID", () => {
    expect(loadCrypto().secureRandomUUID()).toBe(
      "11111111-2222-4333-8444-555555555555",
    );
  });
});

describe("secureRandomUUID — expo-crypto exposes only getRandomBytes", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock("expo-crypto", () => ({
      getRandomBytes: (n: number) => new Uint8Array(n).fill(0xab),
    }));
  });

  afterEach(() => {
    jest.dontMock("expo-crypto");
  });

  it("builds a well-formed v4 UUID from the bytes", () => {
    const value = loadCrypto().secureRandomUUID();
    expect(value).toMatch(UUID_V4);
    // Version and variant nibbles must be forced regardless of the input bytes.
    expect(value.charAt(14)).toBe("4");
    expect("89ab").toContain(value.charAt(19));
  });
});

describe("secureRandomUUID — no expo-crypto, Web Crypto present", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("expo-crypto", () => {
      throw new Error("expo-crypto unavailable");
    });
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues: <T extends ArrayBufferView>(array: T): T => {
          const bytes = new Uint8Array(
            array.buffer,
            array.byteOffset,
            array.byteLength,
          );
          bytes.set(
            Array.from({ length: bytes.length }, (_, i) => (i * 7 + 3) % 256),
          );
          return array;
        },
      },
    });
  });

  afterEach(() => {
    jest.dontMock("expo-crypto");
    if (original) Object.defineProperty(globalThis, "crypto", original);
  });

  it("falls through to globalThis.crypto.getRandomValues", () => {
    expect(loadCrypto().secureRandomUUID()).toMatch(UUID_V4);
  });
});

describe("secureRandomUUID — no CSPRNG at all", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("expo-crypto", () => {
      throw new Error("expo-crypto unavailable");
    });
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    jest.dontMock("expo-crypto");
    if (original) Object.defineProperty(globalThis, "crypto", original);
  });

  it("throws CsprngUnavailableError instead of returning a Math.random value", () => {
    const mod = loadCrypto();
    expect(() => mod.secureRandomUUID()).toThrow(mod.CsprngUnavailableError);
  });

  it("does not consult Math.random on the way to throwing", () => {
    const mod = loadCrypto();
    const spy = jest.spyOn(Math, "random");
    expect(() => mod.secureRandomUUID()).toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("unsafeRandomId", () => {
  it("still produces a v4-shaped id for non-security use", () => {
    expect(loadCrypto().unsafeRandomId()).toMatch(UUID_V4);
  });
});
