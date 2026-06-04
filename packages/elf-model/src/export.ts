/**
 * Export ELF weight table to a format suitable for embedding in the app
 * or for baking into Valhalla tile edge speeds.
 */

import type { ELFWeight } from "./train";

export interface ExportedWeightTable {
  version: string;
  regionId: string;
  generatedAt: number;
  weights: Record<string, number>; // edgeId -> multiplier
}

export function exportWeightTable(
  weights: ELFWeight[],
  regionId: string,
): ExportedWeightTable {
  const table: Record<string, number> = {};
  for (const w of weights) {
    table[w.edgeId] = Math.round(w.multiplier * 100) / 100;
  }

  return {
    version: "1.0.0",
    regionId,
    generatedAt: Date.now(),
    weights: table,
  };
}
