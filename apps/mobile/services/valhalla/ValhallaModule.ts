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

import { v4 as uuidv4 } from "uuid";

import { timeoutSignal } from "@/utils/abort";

import { boundAvoidancePolygons } from "../routing/AvoidanceBudget";
import {
  RouteUnavailableError,
  reasonForValhallaError,
  valhallaDiagnostics,
} from "../routing/RouteUnavailable";
import { reportRoutingFailure } from "../routing/RoutingTelemetry";

import { loadNativeModule, type NativeValhalla } from "./nativeEngine";

import type { ValhallaRouteResponse, ValhallaManeuver } from "./types";
import type {
  LatLng,
  Route,
  RouteOptions,
  RouteManeuver,
  RouteLeg,
} from "@bugrout/shared";

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
const DEFAULT_PORT = 8002;

/** Active integration once init resolves. "native" routes in-process via the
 * Valhalla Turbo Module; "http" routes over fetch (local or remote server). */
let activeApproach: "native" | "http" = "http";

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
        return;
      }
    } catch (err) {
      console.warn(
        "[BugRout] Native Valhalla init failed, falling back to HTTP:",
        err,
      );
      nativeModule = null;
    }
  }

  // Approach B: HTTP server. Either a remote service (EXPO_PUBLIC_VALHALLA_URL
  // / cfg.baseUrl) or a local bundled binary started by the config plugin.
  // Nothing is probed here: init used to GET /status with a 5s timeout purely
  // to set a `ready` flag that no caller ever read (both removed in #134).
  // Reachability is decided per request — calculateRoute() reports "offline"
  // when the server does not answer — so the probe only cost a network round
  // trip on every boot.
  activeApproach = "http";
}

/**
 * Calculate a route using Valhalla.
 *
 * There is no fallback route. When routing fails this throws a
 * {@link RouteUnavailableError} saying why, and the caller shows an honest
 * "no route" state. It used to return a made-up straight-line route presented
 * as a real one, ETA and all (#190).
 *
 * @throws RouteUnavailableError when no real route can be produced.
 */
export async function calculateRoute(
  origin: LatLng,
  destination: LatLng,
  options?: RouteOptions,
): Promise<Route> {
  try {
    return await requestRoute(origin, destination, options);
  } catch (err) {
    // Every failure reaches crash reporting, so an outage like #141 (five
    // months of 400s, every user silently on mock routes) shows up in hours.
    if (err instanceof RouteUnavailableError) {
      reportRoutingFailure(err, activeApproach);
    }
    throw err;
  }
}

/**
 * The routing request itself; {@link calculateRoute} adds failure reporting.
 *
 * @throws RouteUnavailableError when no real route can be produced.
 */
async function requestRoute(
  origin: LatLng,
  destination: LatLng,
  options?: RouteOptions,
): Promise<Route> {
  if (!config) {
    throw new RouteUnavailableError(
      "not_ready",
      "calculateRoute called before initValhalla",
    );
  }

  const body = buildValhallaRequest(origin, destination, options);

  // Approach A: in-process native call. Same request body, same response JSON
  // as the HTTP path, so parseValhallaResponse() is shared.
  if (activeApproach === "native" && nativeModule) {
    let responseJson: string;
    try {
      responseJson = await nativeModule.route(JSON.stringify(body));
    } catch (err) {
      throw new RouteUnavailableError("server_error", "native route failed", {
        cause: err,
      });
    }
    return parseOrThrow(() => JSON.parse(responseJson));
  }

  // Approach B: HTTP server (local bundled or remote).
  const baseUrl = resolveBaseUrl(config);
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: timeoutSignal(10000),
    });
  } catch (err) {
    // No connection, DNS failure, or the timeout fired.
    throw new RouteUnavailableError("offline", "routing service unreachable", {
      cause: err,
    });
  }

  if (!resp.ok) {
    const errorBody: unknown = await resp.json().catch(() => null);
    throw new RouteUnavailableError(
      reasonForValhallaError(errorBody),
      `Valhalla HTTP ${String(resp.status)}: ${JSON.stringify(errorBody)}`,
      { diagnostics: valhallaDiagnostics(resp.status, errorBody) },
    );
  }

  return parseOrThrow(() => resp.json() as Promise<unknown>);
}

/**
 * Parse a Valhalla response, turning a malformed one into a server error
 * rather than a crash or a partial route.
 *
 * @param read - Produces the response JSON.
 * @returns The parsed route.
 */
async function parseOrThrow(read: () => unknown): Promise<Route> {
  try {
    const json = (await read()) as ValhallaRouteResponse;
    return parseValhallaResponse(json);
  } catch (err) {
    throw new RouteUnavailableError(
      "server_error",
      "unreadable routing response",
      { cause: err },
    );
  }
}

/**
 * Build a Valhalla route request body.
 */
function buildValhallaRequest(
  origin: LatLng,
  destination: LatLng,
  options?: RouteOptions,
): Record<string, unknown> {
  const locations = [{ lat: origin.lat, lon: origin.lng, type: "break" }];

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

  const excludePolygons = buildExcludePolygons(origin, destination, options);
  if (excludePolygons.length > 0) {
    request.exclude_polygons = excludePolygons;
  }

  return request;
}

/**
 * Avoidance polygons for threat zones, fitted to the engine's exclude_polygons
 * perimeter limit — past it Valhalla rejects the whole request (#168).
 *
 * @param origin - Trip start.
 * @param destination - Trip end.
 * @param options - Route options carrying `avoidPolygons` and `waypoints`.
 * @returns Outer rings to send as `exclude_polygons`; empty when none apply.
 */
function buildExcludePolygons(
  origin: LatLng,
  destination: LatLng,
  options?: RouteOptions,
): number[][][] {
  const polygons = options?.avoidPolygons ?? [];
  if (polygons.length === 0) return [];

  let bounded;
  try {
    bounded = boundAvoidancePolygons(polygons, [
      origin,
      ...(options?.waypoints ?? []),
      destination,
    ]);
  } catch (err) {
    // This runs before calculateRoute's try: a throw here would escape route
    // calculation entirely. Route without avoidance instead — the preview still
    // warns when the route crosses a threat.
    console.warn(
      "[BugRout] Could not fit threat polygons; routing without avoidance:",
      err,
    );
    return [];
  }
  if (bounded.dropped > 0) {
    console.warn(
      `[BugRout] ${bounded.dropped} threat polygon(s) exceed the routing engine's avoidance limit and were not avoided.`,
    );
  }
  return bounded.polygons.flatMap((p) => p.coordinates.slice(0, 1));
}

/**
 * Parse Valhalla's response into our Route type.
 */
function parseValhallaResponse(response: ValhallaRouteResponse): Route {
  const trip = response.trip;

  // Maneuver shape indices are into their own leg's shape, so each leg is
  // decoded once and shared by its maneuvers and the route geometry.
  const legShapes = trip.legs.map((leg) => decodePolyline(leg.shape));

  const legs: RouteLeg[] = trip.legs.map((leg, i) => ({
    distance: leg.summary.length * 1000, // km to meters
    duration: leg.summary.time,
    maneuvers: leg.maneuvers.map((m) =>
      parseManeuver(m, legShapes.at(i) ?? []),
    ),
  }));

  const allCoordinates: LatLng[] = legShapes.flat();

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
 *
 * The position is the leg shape's point at `begin_shape_index`, where the
 * maneuver happens. It used to be left at (0, 0), so the distance to the next
 * turn read thousands of miles and NavigationController, which advances when
 * the user is within 30 m of a maneuver, never advanced on a real route (#194).
 *
 * @param m - The maneuver from Valhalla's response.
 * @param legShape - The decoded shape of the leg the maneuver belongs to.
 */
function parseManeuver(m: ValhallaManeuver, legShape: LatLng[]): RouteManeuver {
  // Out of range means a malformed response. Fail rather than guess: a turn
  // placed at the wrong point is the silent wrong answer this fixes.
  const position = legShape[m.begin_shape_index];
  if (!position) {
    throw new Error(
      `Valhalla maneuver shape index ${String(m.begin_shape_index)} is outside its leg's ${String(legShape.length)}-point shape`,
    );
  }
  return {
    type: VALHALLA_MANEUVER_TYPES[m.type] ?? "continue",
    instruction: m.instruction,
    streetName: m.street_names?.[0] ?? "",
    distance: m.length * 1000, // km to meters
    duration: m.time,
    position,
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
