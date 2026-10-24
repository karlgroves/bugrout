import { create } from "zustand";

import type { LatLng, Scenario } from "@bugrout/shared";

const MAX_SCENARIOS = 3;

/**
 *
 */
interface ScenarioState {
  scenarios: Scenario[];
  /**
   * A point just chosen on the map for the plan being edited (#187).
   *
   * The pick screen and the editor are separate routes, and the editor must
   * keep the name and stop switches the user has already set, so the point
   * cannot come back as a navigation param that replaces the screen. The
   * editor consumes this and clears it.
   */
  pickedDestination: LatLng | null;

  addScenario: (scenario: Scenario) => void;
  updateScenario: (id: string, updates: Partial<Scenario>) => void;
  deleteScenario: (id: string) => void;
  setScenarios: (scenarios: Scenario[]) => void;
  /** Hand a chosen point to the editor, or clear it once consumed. */
  setPickedDestination: (point: LatLng | null) => void;
}

export /**
 *
 */
const useScenarioStore = create<ScenarioState>((set) => ({
  scenarios: [],
  pickedDestination: null,

  addScenario: (scenario) => {
    set((state) => {
      if (state.scenarios.length >= MAX_SCENARIOS) return state;
      return { scenarios: [...state.scenarios, scenario] };
    });
  },
  updateScenario: (id, updates) => {
    set((state) => ({
      scenarios: state.scenarios.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s,
      ),
    }));
  },
  deleteScenario: (id) => {
    set((state) => ({
      scenarios: state.scenarios.filter((s) => s.id !== id),
    }));
  },
  setScenarios: (scenarios) => {
    set({ scenarios });
  },
  setPickedDestination: (point) => {
    set({ pickedDestination: point });
  },
}));
