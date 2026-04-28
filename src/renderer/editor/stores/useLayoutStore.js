import { create } from "zustand";
import { LP_DEFAULT, DRAWER_DEFAULT, TL_DEFAULT } from "../utils/constants";
// Cross-store import — accessed only inside _pushCrossUndo (after init),
// ESM live bindings resolve the cycle.
import useSubtitleStore from "./useSubtitleStore";

// Push to cross-store undo stack for position changes
function _pushCrossUndo() {
  try {
    useSubtitleStore.getState()._pushUndo();
  } catch (_) {}
}

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

  // ── Timeline zoom ──
  tlZoom: 1,

  // ── Preview zoom ──
  zoom: 100,

  // ── Overlay positions (persisted in templates) ──
  subYPercent: 80,
  capYPercent: 15,
  capWidthPercent: 90,

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
  setTlZoom: (z) => set({ tlZoom: z }),

  setZoom: (z) => set({ zoom: z }),

  // ── Overlay position actions (push undo for Ctrl+Z) ──
  setSubYPercent: (p) => { _pushCrossUndo(); set({ subYPercent: p }); },
  setCapYPercent: (p) => { _pushCrossUndo(); set({ capYPercent: p }); },
  setCapWidthPercent: (w) => { _pushCrossUndo(); set({ capWidthPercent: w }); },
}));

export default useLayoutStore;
