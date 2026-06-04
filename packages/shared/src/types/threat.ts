import type { GeoJSONPolygon, GeoJSONMultiPolygon } from "./geo";

export type ThreatType = "wildfire" | "flood" | "weather";

export type ThreatSeverity =
  | "extreme"
  | "severe"
  | "moderate"
  | "minor"
  | "unknown";

export type ThreatSource = "nws" | "fema" | "usfs";

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
