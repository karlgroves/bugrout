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
  /**
   * The address this plan was saved by, as the geocoder returned it.
   *
   * `null` for a plan set by dropping a pin on the map, and for every plan
   * saved before plans had addresses at all (#187). Routing uses
   * {@link Scenario.destination} and never this, so a plan with no address
   * still works exactly as it did.
   */
  address: string | null;
  /** Custom avoidance zones drawn by user */
  avoidZones: GeoJSONPolygon[];
  resourceStops: ResourceStopPreference[];
  createdAt: number;
  updatedAt: number;
}
