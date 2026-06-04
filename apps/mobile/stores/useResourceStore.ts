import { create } from "zustand";

import type { ResourcePoint, ResourceType } from "@bugrout/shared";

/**
 *
 */
interface ResourceState {
  resources: ResourcePoint[];
  /** Which resource types are visible on the map */
  visibleTypes: Set<ResourceType>;

  setResources: (resources: ResourcePoint[]) => void;
  addResources: (resources: ResourcePoint[]) => void;
  toggleResourceType: (type: ResourceType) => void;
}

export /**
 *
 */
const useResourceStore = create<ResourceState>((set) => ({
  resources: [],
  visibleTypes: new Set(["fuel", "water", "shelter"] as ResourceType[]),

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
