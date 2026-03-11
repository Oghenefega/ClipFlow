import { create } from "zustand";
import { LP_DEFAULT, DRAWER_DEFAULT, TL_DEFAULT } from "../utils/constants";

const useLayoutStore = create((set, get) => ({
  // ── Left panel ──
  lpTab: "transcript",
  lpCollapsed: false,
  lpWidth: LP_DEFAULT,

  // ── Right drawer ──
  drawerOpen: true,
  activePanel: "ai",
  drawerWidth: DRAWER_DEFAULT,

  // ── Timeline ──
  tlCollapsed: false,
  tlHeight: TL_DEFAULT,
  tlOverlay: false,

  // ── Timeline zoom ──
  tlZoom: 1,

  // ── Preview zoom ──
  zoom: 100,

  // ── Actions ──
  setLpTab: (tab) => set({ lpTab: tab }),
  toggleLpCollapse: () => set((s) => ({ lpCollapsed: !s.lpCollapsed })),
  setLpWidth: (w) => set({ lpWidth: w }),

  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setDrawerWidth: (w) => set({ drawerWidth: w }),

  togglePanel: (panelId) => {
    const { activePanel, drawerOpen } = get();
    if (activePanel === panelId && drawerOpen) {
      set({ drawerOpen: false });
    } else {
      set({ activePanel: panelId, drawerOpen: true });
    }
  },

  toggleTlCollapse: () => set((s) => ({ tlCollapsed: !s.tlCollapsed })),
  setTlHeight: (h) => set({ tlHeight: h }),
  setTlOverlay: (v) => set({ tlOverlay: v }),
  setTlZoom: (z) => set({ tlZoom: z }),

  setZoom: (z) => set({ zoom: z }),
}));

export default useLayoutStore;
