/**
 * The Valhalla config plugin wires in only the platforms whose library is built.
 *
 * The prebuilt libraries are build outputs, not committed, so a checkout with
 * one platform's library or neither is normal. Wiring a platform regardless
 * breaks its build: Android without `jniLibs` failed Gradle with "missing and no
 * known rule to make it" and took the Detox job down. These tests pin which
 * mods the plugin registers for each combination.
 */
import fs from "node:fs";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the plugin is CommonJS, loaded by expo prebuild
const withValhalla = require("../../native-modules/valhalla/config-plugin") as (
  config: Record<string, unknown>,
  options?: { approach?: string },
) => Record<string, unknown>;

/** Each mod the plugin registered: the helper, and the platform for dangerous mods. */
const mockMods: string[] = [];

jest.mock("expo/config-plugins", () => ({
  withDangerousMod: (config: unknown, [platform]: [string]): unknown => {
    mockMods.push(`dangerous:${platform}`);
    return config;
  },
  withMainApplication: (config: unknown): unknown => {
    mockMods.push("mainApplication");
    return config;
  },
  withAppBuildGradle: (config: unknown): unknown => {
    mockMods.push("appBuildGradle");
    return config;
  },
}));

const MODULE_DIR = path.join(__dirname, "../../native-modules/valhalla");
const IOS_LIB = path.join(MODULE_DIR, "bin", "ios", "valhalla.xcframework");
const ANDROID_LIB = path.join(MODULE_DIR, "bin", "android", "jniLibs");

const IOS_MODS = ["dangerous:ios"];
const ANDROID_MODS = ["dangerous:android", "mainApplication", "appBuildGradle"];

/**
 * Pretend exactly these prebuilt libraries exist.
 *
 * @param built - The library paths that exist.
 */
function withLibraries(...built: string[]): void {
  const real = fs.existsSync.bind(fs);
  jest
    .spyOn(fs, "existsSync")
    .mockImplementation((p) =>
      p === IOS_LIB || p === ANDROID_LIB ? built.includes(p) : real(p),
    );
}

let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  mockMods.length = 0;
});

describe("withValhalla", () => {
  it("wires both platforms when both libraries are built", () => {
    withLibraries(IOS_LIB, ANDROID_LIB);
    withValhalla({});

    expect(mockMods).toEqual([...IOS_MODS, ...ANDROID_MODS]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("wires only iOS when only the iOS library is built", () => {
    withLibraries(IOS_LIB);
    withValhalla({});

    expect(mockMods).toEqual(IOS_MODS);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Skipping Android"),
    );
  });

  it("wires only Android when only the Android library is built", () => {
    withLibraries(ANDROID_LIB);
    withValhalla({});

    expect(mockMods).toEqual(ANDROID_MODS);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping iOS"));
  });

  it("wires nothing when neither library is built", () => {
    withLibraries();
    withValhalla({});

    expect(mockMods).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("wires nothing for the HTTP approach, whatever is built", () => {
    withLibraries(IOS_LIB, ANDROID_LIB);
    withValhalla({}, { approach: "http" });

    expect(mockMods).toEqual([]);
  });
});
