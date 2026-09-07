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

// #371: the dragged timeline height survives reopening the editor (the shell
// remounts per clip), the same way the left/preview split does via its
// autoSaveId. 0 / missing = as tall as the lanes.
const TL_HEIGHT_KEY = "clipflow-editor-tlheight";
function readTlHeight() {
  try {
    const v = parseInt(window.localStorage.getItem(TL_HEIGHT_KEY), 10);
    return Number.isFinite(v) && v > 0 ? v : TL_DEFAULT;
  } catch (_) {
    return TL_DEFAULT;
  }
}
function writeTlHeight(h) {
  try { window.localStorage.setItem(TL_HEIGHT_KEY, String(Math.round(h))); } catch (_) {}
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
  tlHeight: readTlHeight(),

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
  setTlHeight: (h) => { writeTlHeight(h); set({ tlHeight: h }); },
  setTlZoom: (z) => set({ tlZoom: z }),

  setZoom: (z) => set({ zoom: z }),

  // ── Overlay position actions (push undo for Ctrl+Z) ──
  setSubYPercent: (p) => { _pushCrossUndo(); set({ subYPercent: p }); },
  setCapYPercent: (p) => { _pushCrossUndo(); set({ capYPercent: p }); },
  setCapWidthPercent: (w) => { _pushCrossUndo(); set({ capWidthPercent: w }); },
}));

export default useLayoutStore;
