/**
 * Category of evacuation resource (fuel, water, or shelter).
 */
export type ResourceType = "fuel" | "water" | "shelter";

/**
 * Upstream provider a resource point was sourced from.
 */
export type ResourceSource =
  | "nrel"
  | "usgs"
  | "osm"
  | "redcross"
  | "open211";

/**
 * A geolocated evacuation resource such as a fuel station or shelter.
 */
export interface ResourcePoint {
  id: string;
  type: ResourceType;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  /** Source-specific metadata (fuel types, capacity, etc.) */
  metadata: Record<string, unknown>;
  source: ResourceSource;
  fetchedAt: number;
  regionId: string;
}
