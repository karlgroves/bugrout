import { create } from "zustand";

import type { ResourcePoint, ResourceType } from "@bugrout/shared";

/**
 *
 */
interface ResourceState {
  resources: ResourcePoint[];
  /** Which resource types are visible on the map */
  visibleTypes: Set<ResourceType>;
  /**
   * How current the shelter layer is (#201): when its data was fetched, and
   * whether the last attempt to refresh it failed. Shelters open and close
   * during an event, so the map shows this rather than an unexplained layer.
   */
  shelterStatus: { asOf: number | null; failed: boolean };

  setResources: (resources: ResourcePoint[]) => void;
  addResources: (resources: ResourcePoint[]) => void;
  toggleResourceType: (type: ResourceType) => void;
  setShelterStatus: (status: { asOf: number | null; failed: boolean }) => void;
}

export /**
 *
 */
const useResourceStore = create<ResourceState>((set) => ({
  resources: [],
  visibleTypes: new Set(["fuel", "water", "shelter"] as ResourceType[]),
  shelterStatus: { asOf: null, failed: false },

  setResources: (resources) => {
    set({ resources });
  },
  addResources: (resources) => {
    set((state) => ({
      resources: [
        ...state.resources.filter(
          (existing) => !resources.some((r) => r.id === existing.id),
        ),
        ...resources,
      ],
    }));
  },
  setShelterStatus: (status) => {
    set({ shelterStatus: status });
  },
  toggleResourceType: (type) => {
    set((state) => {
      const next = new Set(state.visibleTypes);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return { visibleTypes: next };
    });
  },
}));
