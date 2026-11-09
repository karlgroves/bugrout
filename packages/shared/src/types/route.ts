import type { LatLng, GeoJSONPolygon } from "./geo";
import type { ResourceType } from "./resource";

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

/**
 * Why a resource stop the driver asked for is not on the previewed route.
 *
 * - `in-threat` — every stop of that type within the allowed detour sits
 *   inside an active threat zone, so none of them was routable (#295).
 * - `none-nearby` — no stop of that type was found within the allowed detour.
 * - `routing-failed` — a stop was found, but no route could be built through
 *   it, so the route without resource stops is the one shown (#295).
 */
export type DroppedStopReason = "in-threat" | "none-nearby" | "routing-failed";

/**
 * A requested resource stop that the previewed route does not include.
 *
 * A dropped stop is a normal outcome, not an error, but it changes the plan
 * the driver is about to commit to, so the preview says so (#341).
 */
export interface DroppedStop {
  /** The kind of stop that was asked for. */
  type: ResourceType;
  reason: DroppedStopReason;
  /** The stop this is about, when one is known; `null` when none was found. */
  name: string | null;
  /** Estimated there-and-back detour to that stop, in metres, when known. */
  detourMeters: number | null;
}
