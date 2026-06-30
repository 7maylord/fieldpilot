import { create } from 'zustand';

type UiState = {
  navigationOpen: boolean;
  updateAvailable: boolean;
  setNavigationOpen: (open: boolean) => void;
  setUpdateAvailable: (available: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  navigationOpen: false,
  updateAvailable: false,
  setNavigationOpen: (navigationOpen) => set({ navigationOpen }),
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
}));
