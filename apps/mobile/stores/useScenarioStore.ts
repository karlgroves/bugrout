import { create } from "zustand";

import type { Scenario } from "@bugrout/shared";

const MAX_SCENARIOS = 3;

/**
 *
 */
interface ScenarioState {
  scenarios: Scenario[];

  addScenario: (scenario: Scenario) => void;
  updateScenario: (id: string, updates: Partial<Scenario>) => void;
  deleteScenario: (id: string) => void;
  setScenarios: (scenarios: Scenario[]) => void;
}

export /**
 *
 */
const useScenarioStore = create<ScenarioState>((set) => ({
  scenarios: [],

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
}));
