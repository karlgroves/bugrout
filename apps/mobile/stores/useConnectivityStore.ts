import { create } from "zustand";

interface ConnectivityState {
  isOnline: boolean;
  setOnline: (online: boolean) => void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  isOnline: true, // Optimistic default — network check will correct if offline
  setOnline: (online) => set({ isOnline: online }),
}));
