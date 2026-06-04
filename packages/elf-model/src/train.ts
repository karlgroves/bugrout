/**
 * ELF (Evacuation Load Factor) weight table trainer.
 *
 * The MVP model is a deterministic lookup table, not ML.
 * ELF multiplier ranges from 1.0 (no congestion expected) to 10.0 (severe congestion).
 *
 * Calibrated against known evacuation corridors:
 * - Camp Fire, Paradise CA (2018): Skyway, Pentz Rd
 * - Hurricane Ian, Fort Myers FL (2022): I-75, US-41
 * - Hurricane Harvey, Houston TX (2017): I-10, I-45
 */

import type { RoadSegmentFeatures } from "./features";

/**
 * A computed ELF weight: the congestion multiplier for a single road edge.
 */
export interface ELFWeight {
  edgeId: string;
  multiplier: number; // 1.0 to 10.0
}

/**
 * Compute ELF multiplier for a road segment based on its features.
 *
 * Higher multiplier = more likely to be congested during evacuation.
 * Applied to base travel time: effective_time = base_time * multiplier.
 */
export function computeELF(features: RoadSegmentFeatures): number {
  let elf = 1.0;

  // Road class: highways get penalized heavily, backroads are preferred
  const classMultiplier: Record<number, number> = {
    0: 6.0, // motorway — always clogs first
    1: 4.5, // trunk
    2: 3.0, // primary
    3: 2.0, // secondary
    4: 1.5, // tertiary
    5: 1.2, // unclassified
    6: 1.0, // residential
  };
  elf *= classMultiplier[features.roadClass] ?? 1.0;
  elf *= proximityFactor(features.popProximity, [
    [5, 1.5],
    [20, 1.2],
  ]);
  elf *= proximityFactor(features.evacOriginProximity, [
    [10, 1.4],
    [30, 1.2],
  ]);

  // Bottleneck indicators
  if (features.isRamp) {
    elf *= 1.3;
  }
  if (features.isBridgeOrTunnel) {
    elf *= 1.5;
  }

  // High traffic roads are more likely to clog
  if (features.historicalADT > 50000) {
    elf *= 1.4;
  } else if (features.historicalADT > 20000) {
    elf *= 1.2;
  }

  // Low lane count on high-class roads = bottleneck
  if (features.roadClass <= 2 && features.laneCount <= 2) {
    elf *= 1.3;
  }

  // Clamp to 1.0 - 10.0 range
  return Math.min(10.0, Math.max(1.0, elf));
}

/**
 * Distance-based factor: returns the factor for the first matching [threshold, factor]
 * tier (ascending), or 1.0 when the distance exceeds all tiers.
 */
function proximityFactor(
  distance: number,
  tiers: [threshold: number, factor: number][],
): number {
  for (const [threshold, factor] of tiers) {
    if (distance < threshold) return factor;
  }
  return 1.0;
}

/**
 * Compute ELF multipliers for every road segment, producing the weight table input.
 */
export function trainELFWeights(
  features: RoadSegmentFeatures[],
): ELFWeight[] {
  return features.map((f) => ({
    edgeId: f.edgeId,
    multiplier: computeELF(f),
  }));
}
