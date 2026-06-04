import type { LatLng, GeoJSONPolygon } from "./geo";

export interface RouteOptions {
  /** Polygons to avoid (threat zones) */
  avoidPolygons?: GeoJSONPolygon[];
  /** Intermediate waypoints (resource stops) */
  waypoints?: LatLng[];
  /** Costing model override */
  costingModel?: "auto" | "truck";
}

export interface RouteManeuver {
  /** Maneuver type (turn-left, turn-right, continue, etc.) */
  type: string;
  /** Human-readable instruction */
  instruction: string;
  /** Street name */
  streetName: string;
  /** Distance in meters to this maneuver from previous */
  distance: number;
  /** Duration in seconds to this maneuver from previous */
  duration: number;
  /** Position of the maneuver */
  position: LatLng;
  /** Bearing after maneuver in degrees */
  bearingAfter: number;
}

export interface RouteLeg {
  distance: number; // meters
  duration: number; // seconds
  maneuvers: RouteManeuver[];
}

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

export type RouteStatus =
  | "idle"
  | "calculating"
  | "active"
  | "rerouting"
  | "completed"
  | "error";
