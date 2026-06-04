import type { GeoJSONPolygon, GeoJSONMultiPolygon } from "./geo";

/**
 * Category of hazard a threat zone represents.
 */
export type ThreatType = "wildfire" | "flood" | "weather";

/**
 * Normalized severity level for a threat, highest to lowest.
 */
export type ThreatSeverity =
  | "extreme"
  | "severe"
  | "moderate"
  | "minor"
  | "unknown";

/**
 * Upstream provider a threat zone was sourced from.
 */
export type ThreatSource = "nws" | "fema" | "usfs";

/**
 * A normalized hazard area to route around, derived from an upstream alert.
 */
export interface ThreatZone {
  id: string;
  type: ThreatType;
  severity: ThreatSeverity;
  geometry: GeoJSONPolygon | GeoJSONMultiPolygon;
  headline: string;
  description: string;
  source: ThreatSource;
  /** When the data was fetched */
  fetchedAt: number;
  /** When the alert expires (null for static data like flood zones) */
  expiresAt: number | null;
}
