import { create } from "zustand";

interface LyricsPanelStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useLyricsPanelStore = create<LyricsPanelStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
