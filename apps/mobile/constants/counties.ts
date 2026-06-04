/**
 * County-Level Download Definitions
 *
 * For users with limited storage, county-level downloads provide
 * smaller packages (~50-200MB vs 500MB-2GB for a full state).
 *
 * Each county group covers a metropolitan area or geographic region
 * that makes sense as a single download unit.
 */

import type { BBox } from "@bugrout/shared";

/**
 *
 */
export interface CountyGroup {
  id: string;
  name: string;
  stateId: string;
  bbox: BBox;
  estimatedSizeMB: number;
  counties: string[]; // FIPS codes
}

/**
 * California county groups — organized by evacuation-relevant regions.
 */
export /**
 *
 */
const CA_COUNTIES: CountyGroup[] = [
  {
    id: "ca-sf-bay",
    name: "SF Bay Area",
    stateId: "ca",
    bbox: { west: -123.0, south: 37.2, east: -121.5, north: 38.3 },
    estimatedSizeMB: 180,
    counties: ["06001", "06013", "06075", "06081", "06085", "06097"],
  },
  {
    id: "ca-la-metro",
    name: "Los Angeles Metro",
    stateId: "ca",
    bbox: { west: -118.9, south: 33.7, east: -117.6, north: 34.8 },
    estimatedSizeMB: 250,
    counties: ["06037", "06059", "06065", "06071"],
  },
  {
    id: "ca-sacramento",
    name: "Sacramento Valley",
    stateId: "ca",
    bbox: { west: -122.5, south: 38.0, east: -120.5, north: 40.0 },
    estimatedSizeMB: 120,
    counties: ["06067", "06061", "06113", "06057"],
  },
  {
    id: "ca-san-diego",
    name: "San Diego",
    stateId: "ca",
    bbox: { west: -117.6, south: 32.5, east: -116.1, north: 33.5 },
    estimatedSizeMB: 100,
    counties: ["06073"],
  },
  {
    id: "ca-sierra-foothills",
    name: "Sierra Foothills",
    stateId: "ca",
    bbox: { west: -121.5, south: 38.5, east: -119.5, north: 40.5 },
    estimatedSizeMB: 90,
    counties: ["06017", "06057", "06061", "06005"],
  },
];

/**
 * Florida county groups.
 */
export /**
 *
 */
const FL_COUNTIES: CountyGroup[] = [
  {
    id: "fl-miami",
    name: "Miami-Dade / Broward",
    stateId: "fl",
    bbox: { west: -80.9, south: 25.1, east: -80.0, north: 26.4 },
    estimatedSizeMB: 120,
    counties: ["12086", "12011"],
  },
  {
    id: "fl-tampa-bay",
    name: "Tampa Bay",
    stateId: "fl",
    bbox: { west: -83.0, south: 27.3, east: -82.0, north: 28.3 },
    estimatedSizeMB: 100,
    counties: ["12057", "12103", "12101"],
  },
  {
    id: "fl-gulf-coast",
    name: "Gulf Coast (Fort Myers)",
    stateId: "fl",
    bbox: { west: -82.5, south: 26.3, east: -81.3, north: 27.2 },
    estimatedSizeMB: 80,
    counties: ["12071", "12021"],
  },
];

/**
 * Texas county groups.
 */
export /**
 *
 */
const TX_COUNTIES: CountyGroup[] = [
  {
    id: "tx-houston",
    name: "Houston Metro",
    stateId: "tx",
    bbox: { west: -96.0, south: 29.3, east: -94.8, north: 30.3 },
    estimatedSizeMB: 200,
    counties: ["48201", "48157", "48039", "48167"],
  },
  {
    id: "tx-dallas",
    name: "Dallas-Fort Worth",
    stateId: "tx",
    bbox: { west: -97.6, south: 32.4, east: -96.3, north: 33.4 },
    estimatedSizeMB: 180,
    counties: ["48113", "48439", "48085", "48121"],
  },
  {
    id: "tx-san-antonio",
    name: "San Antonio / Austin",
    stateId: "tx",
    bbox: { west: -98.8, south: 29.2, east: -97.3, north: 30.7 },
    estimatedSizeMB: 150,
    counties: ["48029", "48453", "48209"],
  },
];

/** All county groups indexed by state */
export /**
 *
 */
const COUNTY_GROUPS: Record<string, CountyGroup[]> = {
  ca: CA_COUNTIES,
  fl: FL_COUNTIES,
  tx: TX_COUNTIES,
};

/**
 * Get county groups for a state.
 */
export function getCountyGroups(stateId: string): CountyGroup[] {
  return COUNTY_GROUPS[stateId] ?? [];
}
