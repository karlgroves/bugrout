import type { LatLng, GeoJSONPolygon } from "./geo";

/**
 * Caller-supplied options influencing route calculation.
 */
export interface RouteOptions {
  /** Polygons to avoid (threat zones) */
  avoidPolygons?: GeoJSONPolygon[];
  /** Intermediate waypoints (resource stops) */
  waypoints?: LatLng[];
  /** Costing model override */
  costingModel?: "auto" | "truck";
}

/**
 * A single turn-by-turn navigation instruction along a route.
 */
export interface RouteManeuver {
  /** Maneuver type (turn-left, turn-right, continue, etc.) */
  type: string;
  /** Human-readable instruction */
  instruction: string;
  /** Street name */
  streetName: string;
  /** Metres from this maneuver to the next (Valhalla's `length`): the stretch it begins */
  distance: number;
  /** Seconds from this maneuver to the next (Valhalla's `time`) */
  duration: number;
  /** Position of the maneuver */
  position: LatLng;
  /** Bearing after maneuver in degrees */
  bearingAfter: number;
}

/**
 * A contiguous segment of a route between two waypoints.
 */
export interface RouteLeg {
  distance: number; // meters
  duration: number; // seconds
  maneuvers: RouteManeuver[];
}

/**
 * A computed evacuation route with geometry, timing, and legs.
 */
export interface Route {
  id: string;
  /** Encoded polyline geometry */
  geometry: string;
  /** Decoded coordinate array for rendering */
  coordinates: LatLng[];
  /** Total distance in meters */
  distance: number;
  /** Total estimated duration in seconds */
  duration: number;
  legs: RouteLeg[];
  /** Summary road names */
  summary: string;
}

/**
 * Lifecycle state of an active or pending route.
 *
 * `previewing` is a calculated route the user has not started; only Go makes
 * it `active`. A calculated route used to be `active` straight away, so
 * backing out of the preview left the map mid-"trip" with the Bug Out button
 * hidden and no way to end it (#189).
 */
export type RouteStatus =
  | "idle"
  | "calculating"
  | "previewing"
  | "active"
  | "rerouting"
  | "completed"
  | "error";
