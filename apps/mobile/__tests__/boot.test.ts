/**
 * Boot validation.
 *
 * Issue #30's complaint: "green CI" means the TypeScript type-checks and the
 * unit tests pass. It does not mean the app boots. `expo-doctor` and
 * `bundle:check` closed part of that gap — SDK alignment and Metro resolution —
 * but neither one executes a line of the startup path. Detox does, on a device,
 * after merge.
 *
 * These tests run the real `bootstrap()` against mocked native modules, on
 * every pull request, in about a second. That does not replace the on-device
 * check and is not meant to: it cannot catch a native crash or a missing
 * .so. What it does catch is the class of failure that reaches production
 * silently — a startup step that throws, a bootstrap that resolves without
 * reaching the onboarding decision, or a regression that lets a first-launch
 * user past the legal disclaimer.
 *
 * Every native module is faked at the seam the app already has for it, so this
 * exercises the orchestration in AppBootstrap.ts rather than the platform.
 */

import { getPreference } from "@/db/queries/preferences";
import { bootstrap } from "@/services/AppBootstrap";
import { useMapStore } from "@/stores/useMapStore";
import { useScenarioStore } from "@/stores/useScenarioStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

jest.mock("@/db/database", () => ({
  getDatabase: jest.fn().mockResolvedValue({}),
}));
jest.mock("@/db/queries/preferences", () => ({
  getPreference: jest.fn().mockResolvedValue(null),
  setPreference: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/db/queries/scenarios", () => ({
  getScenarios: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/services/tiles/TileManager", () => ({
  getDownloadedRegions: jest.fn().mockResolvedValue([]),
  getStaleRegions: jest.fn().mockResolvedValue([]),
  isRegionStale: jest.fn().mockReturnValue(false),
}));
jest.mock("@/services/MockDemoData", () => ({
  loadMockDemoData: jest.fn(),
}));
jest.mock("@/services/threats/ThreatSync", () => ({
  loadCachedThreats: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/resources/ResourceSync", () => ({
  loadCachedResources: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/valhalla/ValhallaModule", () => ({
  initValhalla: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/valhalla/ValhallaTiles", () => ({
  planValhallaInit: jest
    .fn()
    .mockResolvedValue({ tileDir: "/tiles", approach: "B" }),
}));
jest.mock("@/services/SettingsPersistence", () => ({
  startSettingsPersistence: jest.fn().mockReturnValue(() => undefined),
}));
jest.mock("@/platform/analytics", () => ({
  initAnalytics: jest.fn(),
  track: jest.fn(),
  Events: {},
}));
jest.mock("@/platform/sentry", () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
}));

const mockGetPreference = getPreference as jest.MockedFunction<
  typeof getPreference
>;

describe("bootstrap — the app starts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPreference.mockResolvedValue(null);
  });

  it("completes without throwing on a first launch", async () => {
    await expect(bootstrap()).resolves.toBeDefined();
  });

  it("returns a result with every field the root layout reads", async () => {
    const result = await bootstrap();
    expect(Object.keys(result).sort()).toEqual([
      "hasDownloadedTiles",
      "needsOnboarding",
      "staleTileCount",
    ]);
    expect(typeof result.needsOnboarding).toBe("boolean");
    expect(typeof result.hasDownloadedTiles).toBe("boolean");
    expect(typeof result.staleTileCount).toBe("number");
  });

  it("requires onboarding when the disclaimer has never been accepted", async () => {
    mockGetPreference.mockResolvedValue(null);
    await expect(bootstrap()).resolves.toMatchObject({
      needsOnboarding: true,
    });
  });

  it("requires onboarding when the stored value is anything but 'true'", async () => {
    for (const stored of ["false", "", "TRUE", "1", "yes"]) {
      mockGetPreference.mockResolvedValue(stored);
      const result = await bootstrap();
      expect(result.needsOnboarding).toBe(true);
    }
  });

  it("skips onboarding only once the disclaimer is accepted", async () => {
    mockGetPreference.mockResolvedValue("true");
    await expect(bootstrap()).resolves.toMatchObject({
      needsOnboarding: false,
    });
  });

  it("reports no downloaded tiles on a fresh install", async () => {
    const result = await bootstrap();
    expect(result.hasDownloadedTiles).toBe(false);
    expect(useMapStore.getState().tilesLoaded).toBe(false);
  });

  it("populates the stores the first screen renders from", async () => {
    await bootstrap();
    expect(useScenarioStore.getState().scenarios).toEqual([]);
    expect(useSettingsStore.getState().units).toBeDefined();
  });

  it("applies persisted settings rather than leaving defaults", async () => {
    mockGetPreference.mockImplementation((key: string) =>
      Promise.resolve(
        (
          {
            units: "km",
            voice_enabled: "false",
            battery_optimization: "false",
            crowd_signal_opt_in: "true",
          } as Record<string, string>
        )[key] ?? null,
      ),
    );

    await bootstrap();

    const settings = useSettingsStore.getState();
    expect(settings.units).toBe("km");
    expect(settings.voiceEnabled).toBe(false);
    expect(settings.batteryOptimization).toBe(false);
    expect(settings.crowdSignalOptIn).toBe(true);
  });
});

describe("bootstrap — failure modes reach the caller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPreference.mockResolvedValue(null);
  });

  it("rejects rather than resolving half-done when the database fails", async () => {
    // The root layout catches this and routes to onboarding. What must not
    // happen is bootstrap resolving with a result that looks complete.
    const { getDatabase } = jest.requireMock<{
      getDatabase: jest.Mock;
    }>("@/db/database");
    getDatabase.mockRejectedValueOnce(new Error("sqlite unavailable"));

    await expect(bootstrap()).rejects.toThrow("sqlite unavailable");
  });

  it("still boots when Valhalla initialisation fails", async () => {
    // Routing being unavailable must not stop the app from starting — the map,
    // the downloaded tiles and the legal screens all still work without it.
    const { getDownloadedRegions } = jest.requireMock<{
      getDownloadedRegions: jest.Mock;
    }>("@/services/tiles/TileManager");
    getDownloadedRegions.mockResolvedValueOnce([
      { id: "bay-area", bbox: { north: 1, south: 0, east: 1, west: 0 } },
    ]);
    const { initValhalla } = jest.requireMock<{ initValhalla: jest.Mock }>(
      "@/services/valhalla/ValhallaModule",
    );
    initValhalla.mockRejectedValueOnce(new Error("no routing tiles"));

    await expect(bootstrap()).resolves.toMatchObject({
      hasDownloadedTiles: true,
    });
  });
});
