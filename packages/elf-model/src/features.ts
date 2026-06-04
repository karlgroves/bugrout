/**
 * Feature extraction from OSM road segments for ELF weight computation.
 *
 * Each road segment gets scored on factors that predict evacuation congestion:
 * - Road class and capacity (highway vs backroad)
 * - Proximity to population centers
 * - Proximity to known evacuation origin zones
 * - Infrastructure flags (bridges, tunnels, ramps)
 * - Historical average daily traffic (ADT) from FHWA data
 */

/**
 * Per-road-segment feature vector used to compute an ELF congestion multiplier.
 */
export interface RoadSegmentFeatures {
  edgeId: string;
  /** 0=motorway, 1=trunk, 2=primary, 3=secondary, 4=tertiary, 5=unclassified, 6=residential */
  roadClass: number;
  laneCount: number;
  /** Distance in km to nearest population center */
  popProximity: number;
  /** Distance in km to nearest evacuation origin zone */
  evacOriginProximity: number;
  /** Highway on/off ramp */
  isRamp: boolean;
  /** Bridge or tunnel */
  isBridgeOrTunnel: boolean;
  /** Historical average daily traffic (vehicles/day), 0 if unknown */
  historicalADT: number;
}

/**
 * Extract per-road-segment ELF feature vectors from an OSM PBF extract.
 */
export function extractFeatures(
  _osmPbfPath: string,
  _regionId: string,
): RoadSegmentFeatures[] {
  // TODO: Implement OSM PBF parsing with osmium or osm-pbf-parser
  // 1. Parse PBF for highway ways
  // 2. Extract road class from highway tag
  // 3. Extract lane count from lanes tag
  // 4. Calculate proximity to Census TIGER place centroids
  // 5. Calculate proximity to WUI/coastal evacuation zones
  // 6. Check bridge=yes, tunnel=yes tags
  // 7. Join with FHWA HPMS data for ADT
  throw new Error("Not yet implemented — requires OSM PBF parsing");
}
