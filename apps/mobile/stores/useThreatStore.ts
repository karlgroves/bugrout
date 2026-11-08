import { create } from "zustand";

import type { ThreatZone, ThreatSource } from "@bugrout/shared";

/**
 *
 */
interface ThreatState {
  threatZones: ThreatZone[];
  /** When each source was last fetched */
  lastFetched: Partial<Record<ThreatSource, number>>;
  /**
   * Sources whose last refresh failed (#288). A failed source keeps whatever
   * was cached, and nothing on screen may read it as "no active threats".
   */
  failedSources: Partial<Record<ThreatSource, boolean>>;
  /** Whether threat avoidance routing is enabled */
  avoidanceEnabled: boolean;

  setThreats: (threats: ThreatZone[]) => void;
  addThreats: (threats: ThreatZone[]) => void;
  setLastFetched: (source: ThreatSource, timestamp: number) => void;
  setSourceFailed: (source: ThreatSource, failed: boolean) => void;
  setAvoidanceEnabled: (enabled: boolean) => void;
  clearThreats: () => void;
}

export /**
 *
 */
const useThreatStore = create<ThreatState>((set) => ({
  threatZones: [],
  lastFetched: {},
  failedSources: {},
  avoidanceEnabled: true,

  setThreats: (threats) => {
    set({ threatZones: threats });
  },
  addThreats: (threats) => {
    set((state) => ({
      threatZones: [
        ...state.threatZones.filter(
          (existing) => !threats.some((t) => t.id === existing.id),
        ),
        ...threats,
      ],
    }));
  },
  setLastFetched: (source, timestamp) => {
    set((state) => ({
      lastFetched: { ...state.lastFetched, [source]: timestamp },
    }));
  },
  setSourceFailed: (source, failed) => {
    set((state) => ({
      failedSources: { ...state.failedSources, [source]: failed },
    }));
  },
  setAvoidanceEnabled: (enabled) => {
    set({ avoidanceEnabled: enabled });
  },
  clearThreats: () => {
    set({ threatZones: [], lastFetched: {}, failedSources: {} });
  },
}));
