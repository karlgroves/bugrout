import type { LatLng, GeoJSONPolygon } from "./geo";

/**
 * User preference for inserting a resource stop along a route.
 */
export interface ResourceStopPreference {
  type: "fuel" | "water";
  /** Maximum acceptable detour in meters */
  maxDetour: number;
  enabled: boolean;
}

/**
 * A saved evacuation scenario: destination plus routing preferences.
 */
export interface Scenario {
  id: string;
  name: string;
  destination: LatLng;
  /** Custom avoidance zones drawn by user */
  avoidZones: GeoJSONPolygon[];
  resourceStops: ResourceStopPreference[];
  createdAt: number;
  updatedAt: number;
}
