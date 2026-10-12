import { create } from "zustand";

import type { ResourcePoint, ResourceType } from "@bugrout/shared";

/** The layers whose freshness the map reports. */
export type StatusLayer = "fuel" | "shelter";

/** When a layer's data was fetched, and whether its last refresh failed. */
export interface LayerStatus {
  asOf: number | null;
  failed: boolean;
}

/**
 *
 */
interface ResourceState {
  resources: ResourcePoint[];
  /** Which resource types are visible on the map */
  visibleTypes: Set<ResourceType>;
  /**
   * How current each fetched layer is: when its data was fetched, and whether
   * the last attempt to refresh it failed. Shelters (#201) open and close
   * during an event, and the fuel layer (#200) depends on a shared public
   * server, so the map shows this rather than an unexplained empty layer.
   */
  layerStatus: Record<StatusLayer, LayerStatus>;

  setResources: (resources: ResourcePoint[]) => void;
  addResources: (resources: ResourcePoint[]) => void;
  toggleResourceType: (type: ResourceType) => void;
  setLayerStatus: (layer: StatusLayer, status: LayerStatus) => void;
}

export /**
 *
 */
const useResourceStore = create<ResourceState>((set) => ({
  resources: [],
  visibleTypes: new Set(["fuel", "water", "shelter"] as ResourceType[]),
  layerStatus: {
    fuel: { asOf: null, failed: false },
    shelter: { asOf: null, failed: false },
  },

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
  setLayerStatus: (layer, status) => {
    set((state) => ({
      layerStatus: { ...state.layerStatus, [layer]: status },
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
