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
  /**
   * When each source's cached data was last fetched successfully (#340).
   * Unlike `lastFetched` this survives a restart (ThreatFreshness persists
   * it), so the route preview can say how old the threats it checked are.
   * `lastFetched` stays the in-session TTL clock and starts empty on purpose:
   * a cold start always refetches when it can.
   */
  dataAsOf: Partial<Record<ThreatSource, number>>;
  /** Whether threat avoidance routing is enabled */
  avoidanceEnabled: boolean;

  setThreats: (threats: ThreatZone[]) => void;
  addThreats: (threats: ThreatZone[]) => void;
  setLastFetched: (source: ThreatSource, timestamp: number) => void;
  setSourceFailed: (source: ThreatSource, failed: boolean) => void;
  setDataAsOf: (source: ThreatSource, timestamp: number) => void;
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
  dataAsOf: {},
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
  setDataAsOf: (source, timestamp) => {
    set((state) => ({
      dataAsOf: { ...state.dataAsOf, [source]: timestamp },
    }));
  },
  setAvoidanceEnabled: (enabled) => {
    set({ avoidanceEnabled: enabled });
  },
  clearThreats: () => {
    set({
      threatZones: [],
      lastFetched: {},
      failedSources: {},
      dataAsOf: {},
    });
  },
}));
