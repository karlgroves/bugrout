import type { LatLng, GeoJSONPolygon } from "./geo";

export interface ResourceStopPreference {
  type: "fuel" | "water";
  /** Maximum acceptable detour in meters */
  maxDetour: number;
  enabled: boolean;
}

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
