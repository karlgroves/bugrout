/**
 * Tests for the file-system platform wrapper.
 *
 * `documentDirectory` used to be "/mock-documents/" on every platform, so on a
 * native build every tile directory was created under a path that cannot exist
 * and offline map downloads failed before starting. And because the wrapper
 * swallowed native errors, nothing surfaced it. Both properties are pinned here.
 *
 * Each test re-imports the module under `jest.isolateModules` so the mocked
 * native module is picked up at require time.
 */

import type * as FileSystemNamespace from "@/platform/fileSystem";

type FileSystemModule = typeof FileSystemNamespace;

/** Load platform/fileSystem fresh, so the module-level probe re-runs. */
function loadFileSystem(): FileSystemModule {
  let mod: FileSystemModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules needs a require to pick up the per-test mocks
    mod = require("@/platform/fileSystem") as FileSystemModule;
  });
  if (!mod) throw new Error("failed to load @/platform/fileSystem");
  return mod;
}

describe("platform/fileSystem on a native build", () => {
  const makeDirectoryAsync = jest.fn(() =>
    Promise.reject(new Error("permission denied")),
  );

  beforeEach(() => {
    jest.resetModules();
    jest.doMock("expo-file-system/legacy", () => ({
      documentDirectory:
        "file:///data/Containers/Data/Application/APP-ID/Documents/",
      makeDirectoryAsync,
    }));
  });

  afterEach(() => {
    jest.dontMock("expo-file-system/legacy");
  });

  it("uses the app's real documents directory, not the mock path", () => {
    expect(loadFileSystem().documentDirectory).toBe(
      "file:///data/Containers/Data/Application/APP-ID/Documents/",
    );
  });

  it("surfaces native errors instead of swallowing them", async () => {
    await expect(
      loadFileSystem().makeDirectoryAsync("/x", { intermediates: true }),
    ).rejects.toThrow("permission denied");
  });
});

describe("platform/fileSystem without the native module (Expo Go)", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock("expo-file-system/legacy", () => {
      throw new Error("Cannot find native module 'ExpoFileSystem'");
    });
  });

  afterEach(() => {
    jest.dontMock("expo-file-system/legacy");
  });

  it("falls back to the mock directory and no-op operations", async () => {
    const fs = loadFileSystem();
    expect(fs.documentDirectory).toBe("/mock-documents/");
    await expect(fs.makeDirectoryAsync("/x")).resolves.toBeUndefined();
    await expect(fs.getInfoAsync("/x")).resolves.toEqual({ exists: false });
  });
});
