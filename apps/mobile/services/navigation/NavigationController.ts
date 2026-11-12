/**
 * Navigation Controller
 *
 * Central orchestrator for active turn-by-turn navigation.
 * Coordinates all real-time services:
 *
 * 1. Location tracking → position updates
 * 2. Maneuver advancement → current instruction
 * 3. Deviation detection → reroute trigger
 * 4. Voice announcements → TTS at approach distances
 * 5. Crowd signal → anonymous telemetry when opted in
 * 6. Battery optimization → dynamic GPS frequency
 * 7. Keep-awake → the screen stays on from start until stop or arrival
 *
 * Lifecycle: start() → running → stop()
 */
/* eslint-disable complexity, sonarjs/cognitive-complexity -- pre-existing; tracked in docs/tech-debt.md (handleVoiceAnnouncements: layered distance/interval announcement rules) */

import { track, Events } from "@/platform/analytics";
import * as Haptics from "@/platform/haptics";
import * as KeepAwake from "@/platform/keepAwake";
import * as Speech from "@/platform/speech";
import { sendSignal } from "@/services/crowd/CrowdSignal";
import {
  startTracking,
  startBatterySavingTracking,
  stopTracking,
  type LocationUpdate,
} from "@/services/location/LocationTracker";
import { hasDeviated } from "@/services/routing/RouteEngine";
import { useRouteStore } from "@/stores/useRouteStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { haversineDistance, projectOntoPolyline } from "@/utils/geo";

import type { LatLng, Route, RouteManeuver } from "@bugrout/shared";

/** Distance thresholds for voice announcements */
const VOICE_APPROACH_HIGHWAY = 500; // meters

/** Distance to next maneuver below which we switch to high-frequency GPS */
const HIGH_FREQ_THRESHOLD = 1000; // meters

/** Maneuver is "passed" when within this distance */
const MANEUVER_PASSED_THRESHOLD = 30; // meters

/** Keep-awake tag; the screen stays on only while navigating (spec §7.1). */
const KEEP_AWAKE_TAG = "bugrout-navigation";

/**
 *
 */
export type NavigationEvent =
  | { type: "position"; update: LocationUpdate }
  | { type: "maneuver_advance"; index: number; maneuver: RouteManeuver }
  | { type: "deviation"; position: LatLng }
  | { type: "arrival" }
  | { type: "voice"; text: string };

/**
 *
 */
export type NavigationEventHandler = (event: NavigationEvent) => void;

/**
 *
 */
interface NavigationState {
  route: Route;
  currentManeuverIndex: number;
  lastSpokenManeuverIndex: number;
  lastAnnouncedDistance: number;
  isHighFreqGps: boolean;
  running: boolean;
  /**
   * The maneuver index has not yet been checked against where the driver
   * actually is. True after {@link start} and {@link updateRoute}; cleared by
   * the first on-route GPS fix, which moves the index to the next maneuver
   * ahead of the driver (#294).
   */
  needsResync: boolean;
}

let state: NavigationState | null = null;
let eventHandler: NavigationEventHandler | null = null;

/**
 * Start active navigation for a given route.
 * Begins GPS tracking and event processing.
 */
export async function start(
  route: Route,
  onEvent: NavigationEventHandler,
): Promise<void> {
  if (state?.running && state.route.id === route.id) {
    // Already driving this route: hand events to the new caller and keep the
    // trip where it is. Restarting would reset guidance to the departure
    // maneuver mid-drive (#294).
    eventHandler = onEvent;
    const index = state.currentManeuverIndex;
    const maneuver = getAllManeuvers(route).at(index);
    if (index > 0 && maneuver)
      emit({ type: "maneuver_advance", index, maneuver });
    return;
  }
  if (state?.running) {
    await stop();
  }

  state = {
    route,
    currentManeuverIndex: 0,
    lastSpokenManeuverIndex: -1,
    lastAnnouncedDistance: Infinity,
    isHighFreqGps: true,
    running: true,
    needsResync: true,
  };
  eventHandler = onEvent;

  // Directions must stay on screen for the whole trip.
  await KeepAwake.activate(KEEP_AWAKE_TAG);

  // Start GPS tracking
  await startTracking(onLocationUpdate);

  // Announce departure
  announceVoice(getManeuverInstruction(route, 0) ?? "Starting navigation");
  track(Events.ROUTE_STARTED, {
    distance_km: Math.round(route.distance / 1000),
    legs: route.legs.length,
  });
}

/**
 * Stop active navigation and clean up all services.
 */
export async function stop(): Promise<void> {
  if (!state) return;

  state.running = false;
  state = null;
  eventHandler = null;

  await KeepAwake.deactivate(KEEP_AWAKE_TAG);
  await stopTracking();
  Speech.stop();
}

/**
 * Check if navigation is currently active.
 */
export function isActive(): boolean {
  return state?.running === true;
}

/**
 * Update the route (after reroute) without stopping navigation.
 */
export function updateRoute(newRoute: Route): void {
  if (!state) return;

  state.route = newRoute;
  state.currentManeuverIndex = 0;
  state.lastSpokenManeuverIndex = -1;
  state.lastAnnouncedDistance = Infinity;
  state.needsResync = true;

  announceVoice("Route updated");
}

/**
 * Synchronous location callback adapter. The GPS tracker expects a void-returning
 * callback, so we void the async handler's promise here and surface any failure.
 */
function onLocationUpdate(update: LocationUpdate): void {
  handleLocationUpdate(update).catch((err: unknown) => {
    console.error("[BugRout] location update handler failed:", err);
  });
}

/**
 * Core handler — processes every GPS location update.
 */
async function handleLocationUpdate(update: LocationUpdate): Promise<void> {
  if (!state?.running) return;

  const { route } = state;
  const position = update.position;

  // 1. Emit position event
  emit({ type: "position", update });

  // 2. Update Zustand store
  useRouteStore.getState().setCurrentManeuverIndex(state.currentManeuverIndex);

  // 3. Check deviation (>500m from route). The store flag tracks the
  // condition on every fix, so it clears once the driver is back on route
  // (#298); setDeviated is a no-op when the value has not changed.
  const deviated = hasDeviated(position, route.coordinates);
  useRouteStore.getState().setDeviated(deviated);
  if (deviated) {
    void Haptics.notification("warning");
    track(Events.DEVIATION_DETECTED);
    emit({ type: "deviation", position });
    return; // Don't process maneuvers while deviated
  }

  // 4. Advance maneuver if we've passed the current one
  const maneuvers = getAllManeuvers(route);
  const currentManeuverIndex = resyncManeuverIndex(position, maneuvers);
  const currentManeuver = maneuvers[currentManeuverIndex];
  if (currentManeuverIndex < maneuvers.length && currentManeuver) {
    const distToManeuver = haversineDistance(
      position,
      currentManeuver.position,
    );

    // Check if we've passed this maneuver
    if (distToManeuver < MANEUVER_PASSED_THRESHOLD) {
      const nextIndex = currentManeuverIndex + 1;
      const nextManeuver = maneuvers[nextIndex];

      if (nextIndex >= maneuvers.length || !nextManeuver) {
        // Arrived at destination. Let the screen lock again now; guidance is
        // over even while the arrival alert waits for the user.
        void KeepAwake.deactivate(KEEP_AWAKE_TAG);
        announceVoice("You have arrived at your destination");
        emit({ type: "arrival" });
        useRouteStore.getState().setStatus("completed");
        return;
      }

      state.currentManeuverIndex = nextIndex;
      void Haptics.selection(); // Subtle tick on maneuver advance
      emit({
        type: "maneuver_advance",
        index: nextIndex,
        maneuver: nextManeuver,
      });
    }

    // 5. Voice announcements at approach distances
    handleVoiceAnnouncements(position, maneuvers);

    // 6. Dynamic GPS frequency based on distance to next maneuver
    await handleGpsFrequency(distToManeuver, update);
  }

  // 7. Crowd signal (anonymous, rate-limited, opt-in)
  void sendSignal(position, update.speed, update.heading);
}

/**
 * On the first on-route fix after a start or a route change, move the maneuver
 * index to the next maneuver ahead of the driver.
 *
 * The index otherwise only advances when the driver comes within
 * {@link MANEUVER_PASSED_THRESHOLD} of the current maneuver. If navigation
 * (re)starts mid-trip — Resume on the trip banner after backing out of the
 * navigation screen, which stopped the controller — the index begins at the
 * departure maneuver, kilometres behind, and would never advance again (#294).
 * On a fresh start at the origin this leaves the index at 0.
 *
 * @returns The index to use for this fix.
 */
function resyncManeuverIndex(
  position: LatLng,
  maneuvers: RouteManeuver[],
): number {
  if (!state) return 0;
  if (!state.needsResync) return state.currentManeuverIndex;
  state.needsResync = false;

  const index = maneuverIndexAhead(position, state.route, maneuvers);
  if (index > state.currentManeuverIndex) {
    const maneuver = maneuvers.at(index);
    state.currentManeuverIndex = index;
    if (maneuver) emit({ type: "maneuver_advance", index, maneuver });
  }
  return state.currentManeuverIndex;
}

/**
 * The first maneuver the driver has not yet passed: the first one no more
 * than {@link MANEUVER_PASSED_THRESHOLD} behind their position along the
 * route line.
 */
function maneuverIndexAhead(
  position: LatLng,
  route: Route,
  maneuvers: RouteManeuver[],
): number {
  const here = projectOntoPolyline(position, route.coordinates);
  if (!here) return 0;

  for (const [i, maneuver] of maneuvers.entries()) {
    const at = projectOntoPolyline(maneuver.position, route.coordinates);
    if (at && at.alongMeters > here.alongMeters - MANEUVER_PASSED_THRESHOLD) {
      return i;
    }
  }
  return Math.max(0, maneuvers.length - 1);
}

/**
 * Handle voice announcements at approach distances.
 */
function handleVoiceAnnouncements(
  position: LatLng,
  maneuvers: RouteManeuver[],
): void {
  if (!state || !useSettingsStore.getState().voiceEnabled) return;

  const idx = state.currentManeuverIndex;
  if (idx >= maneuvers.length) return;

  const maneuver = maneuvers[idx];
  if (!maneuver) return;
  const dist = haversineDistance(position, maneuver.position);
  const threshold = VOICE_APPROACH_HIGHWAY; // Simplified: same threshold for all roads

  // Announce when approaching (within threshold) and haven't announced yet
  if (dist < threshold && state.lastSpokenManeuverIndex !== idx) {
    announceVoice(maneuver.instruction);
    state.lastSpokenManeuverIndex = idx;
  }

  // Announce distance countdown at 200m intervals for long approaches
  if (dist < 1000 && dist > MANEUVER_PASSED_THRESHOLD) {
    const rounded = Math.round(dist / 200) * 200;
    if (rounded < state.lastAnnouncedDistance && rounded > 0) {
      // Only announce significant distances
      if (rounded === 200 || rounded === 400) {
        const distText =
          rounded >= 1000
            ? `${(rounded / 1000).toFixed(1)} kilometers`
            : `${rounded} meters`;
        announceVoice(`In ${distText}, ${maneuver.instruction.toLowerCase()}`);
      }
      state.lastAnnouncedDistance = rounded;
    }
  }
}

/**
 * Dynamically adjust GPS frequency based on proximity to next maneuver.
 * Saves battery on long straight segments.
 */
async function handleGpsFrequency(
  distToNextManeuver: number,
  _currentUpdate: LocationUpdate,
): Promise<void> {
  if (!state || !useSettingsStore.getState().batteryOptimization) return;

  const shouldBeHighFreq = distToNextManeuver < HIGH_FREQ_THRESHOLD;

  if (shouldBeHighFreq && !state.isHighFreqGps) {
    // Switch to high-frequency GPS near maneuver
    state.isHighFreqGps = true;
    await stopTracking();
    await startTracking(onLocationUpdate);
  } else if (!shouldBeHighFreq && state.isHighFreqGps) {
    // Switch to battery-saving GPS on straight segments
    state.isHighFreqGps = false;
    await stopTracking();
    await startBatterySavingTracking(onLocationUpdate);
  }
}

/**
 * Speak text via device TTS.
 */
function announceVoice(text: string): void {
  if (!useSettingsStore.getState().voiceEnabled) return;

  // Stop any current speech before starting new
  Speech.stop();
  Speech.speak(text, {
    language: "en",
    rate: 0.9,
    pitch: 1.0,
  });

  emit({ type: "voice", text });
}

/**
 * Get a specific maneuver instruction text.
 */
function getManeuverInstruction(route: Route, index: number): string | null {
  const maneuvers = getAllManeuvers(route);
  return maneuvers[index]?.instruction ?? null;
}

/**
 * Flatten all maneuvers from all legs into a single array.
 */
function getAllManeuvers(route: Route): RouteManeuver[] {
  return route.legs.flatMap((leg) => leg.maneuvers);
}

/**
 * Emit a navigation event to the handler.
 */
function emit(event: NavigationEvent): void {
  eventHandler?.(event);
}
