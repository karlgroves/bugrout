export type ResourceType = "fuel" | "water" | "shelter";

export type ResourceSource =
  | "nrel"
  | "usgs"
  | "osm"
  | "redcross"
  | "open211";

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
