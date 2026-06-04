/**
 * Valhalla Routing Engine Bridge
 *
 * Supports two integration approaches:
 * - Approach A: Native C++ Turbo Module via JSI (preferred, lower battery)
 * - Approach B: Local HTTP server on localhost (fallback, simpler)
 *
 * The active approach is selected at init time based on what's available.
 * Both produce identical Route output from the same Valhalla tile data.
 */
/* eslint-disable max-lines -- pre-existing; tracked in docs/tech-debt.md (dual-approach Valhalla bridge: native + HTTP + mock fallback in one module) */

import { NativeModules } from "react-native";
import { v4 as uuidv4 } from "uuid";

import type { ValhallaRouteResponse, ValhallaManeuver } from "./types";
import type { LatLng, Route, RouteOptions, RouteManeuver, RouteLeg } from "@bugrout/shared";

/**
 *
 */
export interface ValhallaConfig {
  tileDir: string;
  approach?: "native" | "http";
  /** Port for local HTTP server (Approach B). Default: 8002 */
  httpPort?: number;
  /** Full base URL for a remote Valhalla service (overrides localhost when set). */
  baseUrl?: string;
}

let config: ValhallaConfig | null = null;
let ready = false;
const DEFAULT_PORT = 8002;

/** Active integration once init resolves. "native" routes in-process via the
 * Valhalla Turbo Module; "http" routes over fetch (local or remote server). */
let activeApproach: "native" | "http" = "http";

/**
 *
 */
interface NativeValhalla {
  init: (tileDir: string) => Promise<void>;
  route: (request: string) => Promise<string>;
}
let nativeModule: NativeValhalla | null = null;

/**
 * Resolve the Valhalla base URL from config, env, or the default localhost port.
 */
function resolveBaseUrl(cfg: ValhallaConfig): string {
  if (cfg.baseUrl) return cfg.baseUrl.replace(/\/+$/, "");
  const envUrl = process.env.EXPO_PUBLIC_VALHALLA_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const port = cfg.httpPort ?? DEFAULT_PORT;
  return `http://localhost:${port}`;
}

/**
 * Initialize the Valhalla engine.
 *
 * Approach A: Calls the in-process native module to load tiles into a long-lived
 *   actor_t (preferred; fully offline).
 * Approach B: Points at an HTTP Valhalla server — a remote Fly service via
 *   EXPO_PUBLIC_VALHALLA_URL, or localhost during development.
 */
export async function initValhalla(cfg: ValhallaConfig): Promise<void> {
  config = cfg;
  const approach = cfg.approach ?? "http";

  if (approach === "native") {
    // Approach A: in-process C++ Turbo Module (see native-modules/valhalla).
    // Loads tiles into a long-lived actor_t; routing then happens in-process
    // with no HTTP/subprocess. Falls through to HTTP if the module isn't built
    // into this binary (e.g. Expo Go, web, or a build without the config plugin).
    try {
      const native = loadNativeModule();
      if (native) {
        await native.init(cfg.tileDir);
        nativeModule = native;
        activeApproach = "native";
        ready = true;
        return;
      }
    } catch (err) {
      console.warn("[BugRout] Native Valhalla init failed, falling back to HTTP:", err);
      nativeModule = null;
    }
  }

  activeApproach = "http";

  // Approach B: HTTP server. Either a remote service (EXPO_PUBLIC_VALHALLA_URL
  // / cfg.baseUrl) or a local bundled binary started by the config plugin.
  const baseUrl = resolveBaseUrl(cfg);
  try {
    const resp = await fetch(`${baseUrl}/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      ready = true;
      return;
    }
  } catch {
    // Server not reachable — first route call will fall back to mock
  }

  // Mark as ready optimistically — the first route call will fail
  // gracefully if the server isn't actually running
  ready = true;
}

/**
 * Calculate a route using Valhalla.
 * Falls back to a mock straight-line route when the server isn't reachable.
 */
export async function calculateRoute(
  origin: LatLng,
  destination: LatLng,
  options?: RouteOptions,
): Promise<Route> {
  // If Valhalla isn't configured, use mock route
  if (!config) {
    console.warn("[BugRout] Valhalla not initialized — using mock route.");
    return buildMockRoute(origin, destination);
  }

  const body = buildValhallaRequest(origin, destination, options);

  // Approach A: in-process native call. Same request body, same response JSON
  // as the HTTP path, so parseValhallaResponse() is shared.
  if (activeApproach === "native" && nativeModule) {
    try {
      const responseJson = await nativeModule.route(JSON.stringify(body));
      const valhallaResponse = JSON.parse(responseJson) as ValhallaRouteResponse;
      return parseValhallaResponse(valhallaResponse, origin, destination);
    } catch (err) {
      console.warn("[BugRout] Native Valhalla route failed, using mock route:", err);
      return buildMockRoute(origin, destination);
    }
  }

  // Approach B: HTTP server (local bundled or remote).
  const baseUrl = resolveBaseUrl(config);
  try {
    const resp = await fetch(`${baseUrl}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      throw new Error(`Valhalla HTTP ${resp.status}`);
    }

    const valhallaResponse = (await resp.json()) as ValhallaRouteResponse;
    return parseValhallaResponse(valhallaResponse, origin, destination);
  } catch (err) {
    // Valhalla not running — return mock route for preview
    console.warn("[BugRout] Valhalla unavailable, using mock route:", err);
    return buildMockRoute(origin, destination);
  }
}

/**
 * Check if Valhalla engine is initialized and ready.
 */
export function isReady(): boolean {
  return ready;
}

/**
 * Build a Valhalla route request body.
 */
function buildValhallaRequest(
  origin: LatLng,
  destination: LatLng,
  options?: RouteOptions,
): Record<string, unknown> {
  const locations = [
    { lat: origin.lat, lon: origin.lng, type: "break" },
  ];

  // Insert waypoints as "through" locations
  if (options?.waypoints) {
    for (const wp of options.waypoints) {
      locations.push({ lat: wp.lat, lon: wp.lng, type: "through" });
    }
  }

  locations.push({ lat: destination.lat, lon: destination.lng, type: "break" });

  const request: Record<string, unknown> = {
    locations,
    costing: options?.costingModel ?? "auto",
    directions_options: {
      units: "kilometers",
      language: "en-US",
    },
  };

  // Add avoidance polygons for threat zones
  if (options?.avoidPolygons && options.avoidPolygons.length > 0) {
    request.exclude_polygons = options.avoidPolygons.map(
      (p) => p.coordinates[0], // outer ring
    );
  }

  return request;
}

/**
 * Parse Valhalla's response into our Route type.
 */
function parseValhallaResponse(
  response: ValhallaRouteResponse,
  _origin: LatLng,
  _destination: LatLng,
): Route {
  const trip = response.trip;

  const legs: RouteLeg[] = trip.legs.map((leg) => ({
    distance: leg.summary.length * 1000, // km to meters
    duration: leg.summary.time,
    maneuvers: leg.maneuvers.map((m) => parseManeuver(m)),
  }));

  // Decode all leg shapes into coordinate arrays
  const allCoordinates: LatLng[] = [];
  for (const leg of trip.legs) {
    const decoded = decodePolyline(leg.shape);
    allCoordinates.push(...decoded);
  }

  return {
    id: uuidv4(),
    geometry: trip.legs[0]?.shape ?? "",
    coordinates: allCoordinates,
    distance: trip.summary.length * 1000, // km to meters
    duration: trip.summary.time,
    legs,
    summary: buildSummary(legs),
  };
}

/**
 * Parse a Valhalla maneuver into our RouteManeuver type.
 */
function parseManeuver(m: ValhallaManeuver): RouteManeuver {
  return {
    type: VALHALLA_MANEUVER_TYPES[m.type] ?? "continue",
    instruction: m.instruction,
    streetName: m.street_names?.[0] ?? "",
    distance: m.length * 1000, // km to meters
    duration: m.time,
    position: { lat: 0, lng: 0 }, // Will be populated from shape index
    bearingAfter: 0,
  };
}

/**
 * Build a summary string from route legs.
 */
function buildSummary(legs: RouteLeg[]): string {
  const streetNames = new Set<string>();
  for (const leg of legs) {
    for (const m of leg.maneuvers) {
      if (m.streetName && m.distance > 1000) {
        streetNames.add(m.streetName);
      }
    }
  }
  return Array.from(streetNames).slice(0, 3).join(", ") || "Route";
}

/**
 * Decode a Valhalla encoded polyline (precision 6).
 * Valhalla uses Google's polyline encoding with 1e6 precision.
 */
function decodePolyline(encoded: string): LatLng[] {
  const coordinates: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push({
      lat: lat / 1e6,
      lng: lng / 1e6,
    });
  }

  return coordinates;
}

/**
 * Valhalla maneuver type codes to readable strings.
 */
const VALHALLA_MANEUVER_TYPES: Record<number, string> = {
  0: "none",
  1: "depart",
  2: "depart-right",
  3: "depart-left",
  4: "arrive",
  5: "arrive-right",
  6: "arrive-left",
  7: "continue",
  8: "turn-slight-right",
  9: "turn-right",
  10: "turn-sharp-right",
  11: "uturn-right",
  12: "uturn-left",
  13: "turn-sharp-left",
  14: "turn-left",
  15: "turn-slight-left",
  16: "ramp-straight",
  17: "ramp-right",
  18: "ramp-left",
  19: "exit-right",
  20: "exit-left",
  21: "straight",
  22: "straight",
  23: "merge-left",
  24: "merge-right",
  25: "roundabout-enter",
  26: "roundabout-exit",
  27: "ferry-enter",
  28: "ferry-exit",
};

/**
 * Attempt to load the native Valhalla module (Approach A).
 *
 * Registered as "ValhallaEngine" by native-modules/valhalla/config-plugin.js
 * during prebuild. Exposes init(tileDir) and route(requestJson). Returns null
 * when the module isn't compiled into this binary — Expo Go, web preview, or a
 * build without the config plugin enabled — so callers fall back to HTTP.
 */
function loadNativeModule(): NativeValhalla | null {
  try {
    const mod = (NativeModules as { ValhallaEngine?: unknown }).ValhallaEngine;
    if (
      mod &&
      typeof (mod as Partial<NativeValhalla>).init === "function" &&
      typeof (mod as Partial<NativeValhalla>).route === "function"
    ) {
      return mod as NativeValhalla;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build a mock straight-line route for preview when Valhalla is unavailable.
 * Generates interpolated points and realistic maneuvers.
 */
function buildMockRoute(origin: LatLng, destination: LatLng): Route {
  const EARTH_RADIUS = 6371000;
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const dLng = ((destination.lng - origin.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((origin.lat * Math.PI) / 180) *
      Math.cos((destination.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const distance = EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const duration = distance / 15; // ~15 m/s = ~34 mph avg

  // Interpolate points along the route
  const numPoints = Math.max(10, Math.round(distance / 1000));
  const coordinates: LatLng[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    coordinates.push({
      lat: origin.lat + t * (destination.lat - origin.lat),
      lng: origin.lng + t * (destination.lng - origin.lng),
    });
  }

  const maneuvers: RouteManeuver[] = [
    {
      type: "depart",
      instruction: "Head toward your destination",
      streetName: "Mock Route",
      distance: 0,
      duration: 0,
      position: origin,
      bearingAfter: 0,
    },
    {
      type: "continue",
      instruction: "Continue straight",
      streetName: "Mock Route",
      distance: distance / 2,
      duration: duration / 2,
      position: coordinates[Math.floor(numPoints / 2)] ?? origin,
      bearingAfter: 0,
    },
    {
      type: "arrive",
      instruction: "You have arrived at your destination",
      streetName: "",
      distance: distance / 2,
      duration: duration / 2,
      position: destination,
      bearingAfter: 0,
    },
  ];

  return {
    id: uuidv4(),
    geometry: "",
    coordinates,
    distance,
    duration,
    legs: [{ distance, duration, maneuvers }],
    summary: "Mock Route (Valhalla unavailable)",
  };
}
