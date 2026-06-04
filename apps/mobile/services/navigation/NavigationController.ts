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
 *
 * Lifecycle: start() → running → stop()
 */

import * as Speech from "@/platform/speech";
import * as Haptics from "@/platform/haptics";
import { track, Events } from "@/platform/analytics";
import type { LatLng, Route, RouteManeuver } from "@bugrout/shared";
import {
  startTracking,
  startBatterySavingTracking,
  stopTracking,
  type LocationUpdate,
} from "@/services/location/LocationTracker";
import { hasDeviated } from "@/services/routing/RouteEngine";
import { sendSignal } from "@/services/crowd/CrowdSignal";
import { useRouteStore } from "@/stores/useRouteStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { haversineDistance } from "@/utils/geo";

/** Distance thresholds for voice announcements */
const VOICE_APPROACH_HIGHWAY = 500; // meters

/** Distance to next maneuver below which we switch to high-frequency GPS */
const HIGH_FREQ_THRESHOLD = 1000; // meters

/** Maneuver is "passed" when within this distance */
const MANEUVER_PASSED_THRESHOLD = 30; // meters

export type NavigationEvent =
  | { type: "position"; update: LocationUpdate }
  | { type: "maneuver_advance"; index: number; maneuver: RouteManeuver }
  | { type: "deviation"; position: LatLng }
  | { type: "arrival" }
  | { type: "voice"; text: string };

export type NavigationEventHandler = (event: NavigationEvent) => void;

interface NavigationState {
  route: Route;
  currentManeuverIndex: number;
  lastSpokenManeuverIndex: number;
  lastAnnouncedDistance: number;
  isHighFreqGps: boolean;
  running: boolean;
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
  };
  eventHandler = onEvent;

  // Start GPS tracking
  await startTracking(handleLocationUpdate);

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

  announceVoice("Route updated");
}

/**
 * Core handler — processes every GPS location update.
 */
async function handleLocationUpdate(update: LocationUpdate): Promise<void> {
  if (!state || !state.running) return;

  const { route, currentManeuverIndex } = state;
  const position = update.position;

  // 1. Emit position event
  emit({ type: "position", update });

  // 2. Update Zustand store
  useRouteStore.getState().setCurrentManeuverIndex(currentManeuverIndex);

  // 3. Check deviation (>500m from route)
  if (hasDeviated(position, route.coordinates)) {
    useRouteStore.getState().setDeviated(true);
    Haptics.notification("warning");
    track(Events.DEVIATION_DETECTED);
    emit({ type: "deviation", position });
    return; // Don't process maneuvers while deviated
  }

  // 4. Advance maneuver if we've passed the current one
  const maneuvers = getAllManeuvers(route);
  const currentManeuver = maneuvers[currentManeuverIndex];
  if (currentManeuverIndex < maneuvers.length && currentManeuver) {
    const distToManeuver = haversineDistance(position, currentManeuver.position);

    // Check if we've passed this maneuver
    if (distToManeuver < MANEUVER_PASSED_THRESHOLD) {
      const nextIndex = currentManeuverIndex + 1;
      const nextManeuver = maneuvers[nextIndex];

      if (nextIndex >= maneuvers.length || !nextManeuver) {
        // Arrived at destination
        announceVoice("You have arrived at your destination");
        emit({ type: "arrival" });
        useRouteStore.getState().setStatus("completed");
        return;
      }

      state.currentManeuverIndex = nextIndex;
      Haptics.selection(); // Subtle tick on maneuver advance
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
  sendSignal(position, update.speed, update.heading);
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
        const distText = rounded >= 1000
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
    await startTracking(handleLocationUpdate);
  } else if (!shouldBeHighFreq && state.isHighFreqGps) {
    // Switch to battery-saving GPS on straight segments
    state.isHighFreqGps = false;
    await stopTracking();
    await startBatterySavingTracking(handleLocationUpdate);
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
