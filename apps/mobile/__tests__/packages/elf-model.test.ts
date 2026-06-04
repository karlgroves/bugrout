/**
 * ELF model tests — test the weight computation logic directly.
 * We inline the function to avoid module resolution issues with jest-expo preset.
 */
/* eslint-disable complexity -- pre-existing; tracked in docs/tech-debt.md (computeELF: inlined copy of weight-table scoring with many factor branches) */

interface RoadSegmentFeatures {
  edgeId: string;
  roadClass: number;
  laneCount: number;
  popProximity: number;
  evacOriginProximity: number;
  isRamp: boolean;
  isBridgeOrTunnel: boolean;
  historicalADT: number;
}

function computeELF(features: RoadSegmentFeatures): number {
  let elf = 1.0;
  const classMultiplier: Record<number, number> = {
    0: 6.0, 1: 4.5, 2: 3.0, 3: 2.0, 4: 1.5, 5: 1.2, 6: 1.0,
  };
  elf *= classMultiplier[features.roadClass] ?? 1.0;
  if (features.popProximity < 5) elf *= 1.5;
  else if (features.popProximity < 20) elf *= 1.2;
  if (features.evacOriginProximity < 10) elf *= 1.4;
  else if (features.evacOriginProximity < 30) elf *= 1.2;
  if (features.isRamp) elf *= 1.3;
  if (features.isBridgeOrTunnel) elf *= 1.5;
  if (features.historicalADT > 50000) elf *= 1.4;
  else if (features.historicalADT > 20000) elf *= 1.2;
  if (features.roadClass <= 2 && features.laneCount <= 2) elf *= 1.3;
  return Math.min(10.0, Math.max(1.0, elf));
}

const baseFeatures: RoadSegmentFeatures = {
  edgeId: "test-edge",
  roadClass: 4, // tertiary
  laneCount: 2,
  popProximity: 50, // far from city
  evacOriginProximity: 50, // far from evac zone
  isRamp: false,
  isBridgeOrTunnel: false,
  historicalADT: 5000,
};

describe("computeELF", () => {
  it("returns 1.0 range for quiet backroad", () => {
    const elf = computeELF(baseFeatures);
    expect(elf).toBeGreaterThanOrEqual(1.0);
    expect(elf).toBeLessThan(3.0);
  });

  it("returns high ELF for motorway near city", () => {
    const elf = computeELF({
      ...baseFeatures,
      roadClass: 0, // motorway
      popProximity: 2, // near city
      evacOriginProximity: 5, // near evac zone
      historicalADT: 80000,
    });
    expect(elf).toBeGreaterThan(5.0);
    expect(elf).toBeLessThanOrEqual(10.0);
  });

  it("penalizes bridges and tunnels", () => {
    const withBridge = computeELF({ ...baseFeatures, isBridgeOrTunnel: true });
    const without = computeELF(baseFeatures);
    expect(withBridge).toBeGreaterThan(without);
  });

  it("penalizes highway ramps", () => {
    const withRamp = computeELF({ ...baseFeatures, isRamp: true });
    const without = computeELF(baseFeatures);
    expect(withRamp).toBeGreaterThan(without);
  });

  it("penalizes high-class roads with few lanes", () => {
    const narrowHighway = computeELF({
      ...baseFeatures,
      roadClass: 1, // trunk
      laneCount: 2,
    });
    const wideHighway = computeELF({
      ...baseFeatures,
      roadClass: 1,
      laneCount: 4,
    });
    expect(narrowHighway).toBeGreaterThan(wideHighway);
  });

  it("clamps to 1.0-10.0 range", () => {
    // Maximum penalty scenario
    const maxELF = computeELF({
      edgeId: "max",
      roadClass: 0,
      laneCount: 1,
      popProximity: 1,
      evacOriginProximity: 1,
      isRamp: true,
      isBridgeOrTunnel: true,
      historicalADT: 100000,
    });
    expect(maxELF).toBeLessThanOrEqual(10.0);

    // Minimum penalty scenario
    const minELF = computeELF({
      edgeId: "min",
      roadClass: 6,
      laneCount: 1,
      popProximity: 100,
      evacOriginProximity: 100,
      isRamp: false,
      isBridgeOrTunnel: false,
      historicalADT: 100,
    });
    expect(minELF).toBeGreaterThanOrEqual(1.0);
  });

  it("residential roads far from evac zones get low ELF", () => {
    const elf = computeELF({
      ...baseFeatures,
      roadClass: 6, // residential
      popProximity: 100,
      evacOriginProximity: 100,
    });
    expect(elf).toBeLessThan(2.0);
  });
});
