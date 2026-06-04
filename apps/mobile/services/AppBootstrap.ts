/**
 * App Bootstrap
 *
 * Initializes the app on launch:
 * 1. Initialize SQLite database
 * 2. Load persisted settings into Zustand stores
 * 3. Load saved scenarios
 * 4. Check downloaded tile freshness
 * 5. Load cached threats and resources
 * 6. Determine if onboarding is needed
 */

import { getDatabase } from "@/db/database";
import { getPreference, setPreference } from "@/db/queries/preferences";
import { getScenarios } from "@/db/queries/scenarios";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useScenarioStore } from "@/stores/useScenarioStore";
import { useMapStore } from "@/stores/useMapStore";
import { getDownloadedRegions, getStaleRegions } from "@/services/tiles/TileManager";
import { loadCachedThreats } from "@/services/threats/ThreatSync";
import { loadCachedResources } from "@/services/resources/ResourceSync";
import { loadMockDemoData } from "@/services/MockDemoData";
import { initAnalytics, track, Events } from "@/platform/analytics";
import { startSettingsPersistence } from "@/services/SettingsPersistence";
import { initValhalla } from "@/services/valhalla/ValhallaModule";
import { planValhallaInit } from "@/services/valhalla/ValhallaTiles";
import { initCrashReporting, setRegionContext } from "@/services/CrashReporting";

export interface BootstrapResult {
  needsOnboarding: boolean;
  hasDownloadedTiles: boolean;
  staleTileCount: number;
}

/**
 * Run the full app bootstrap sequence.
 * Call this once during app startup (in root layout).
 */
export async function bootstrap(): Promise<BootstrapResult> {
  // 0. Initialize crash reporting and analytics
  initCrashReporting();
  initAnalytics(process.env.EXPO_PUBLIC_POSTHOG_KEY);

  // 1. Initialize database (creates tables if needed)
  await getDatabase();

  // 2. Load persisted settings and start auto-persistence
  await loadSettings();
  startSettingsPersistence();

  // 3. Load saved scenarios
  const scenarios = await getScenarios();
  useScenarioStore.getState().setScenarios(scenarios);

  // 4. Check downloaded tiles
  const regions = await getDownloadedRegions();
  const hasDownloadedTiles = regions.length > 0;
  useMapStore.getState().setTilesLoaded(hasDownloadedTiles);

  const activeRegion = regions[0];
  if (hasDownloadedTiles && activeRegion) {
    // Set the first region as active by default
    useMapStore.getState().setActiveRegion(activeRegion);
    setRegionContext(activeRegion.id);

    // Initialize Valhalla with the active region's routing tiles. Use the
    // in-process engine when this build opted in and offline tiles are present;
    // otherwise fall back to the remote HTTP service.
    try {
      const plan = await planValhallaInit(activeRegion);
      await initValhalla({
        tileDir: plan.tileDir,
        approach: plan.approach,
      });
    } catch (err) {
      console.warn("Valhalla init failed (routing will be unavailable):", err);
    }

    // Load cached data for the active region
    await loadCachedThreats();
    await loadCachedResources(activeRegion.id);
  }

  // 5. Load mock demo data when no tiles downloaded (preview mode)
  if (!hasDownloadedTiles) {
    loadMockDemoData();
  }

  // 6. Check for stale tiles
  const staleRegions = await getStaleRegions();

  // 7. Check onboarding state
  const disclaimerAccepted = await getPreference("disclaimer_accepted");
  const needsOnboarding = disclaimerAccepted !== "true";

  return {
    needsOnboarding,
    hasDownloadedTiles,
    staleTileCount: staleRegions.length,
  };
}

/**
 * Load persisted settings from SQLite into Zustand store.
 */
async function loadSettings(): Promise<void> {
  const store = useSettingsStore.getState();

  const units = await getPreference("units");
  if (units === "mi" || units === "km") store.setUnits(units);

  const voice = await getPreference("voice_enabled");
  if (voice !== null) store.setVoiceEnabled(voice === "true");

  const battery = await getPreference("battery_optimization");
  if (battery !== null) store.setBatteryOptimization(battery === "true");

  const crowd = await getPreference("crowd_signal_opt_in");
  if (crowd !== null) store.setCrowdSignalOptIn(crowd === "true");
}

/**
 * Persist a setting change to SQLite.
 * Call this when a setting changes in the UI.
 */
export async function persistSetting(
  key: string,
  value: string,
): Promise<void> {
  await setPreference(key, value);
}

/**
 * Mark the disclaimer as accepted.
 */
export async function acceptDisclaimer(): Promise<void> {
  await setPreference("disclaimer_accepted", "true");
  track(Events.DISCLAIMER_ACCEPTED);
}
