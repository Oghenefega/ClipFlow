import { create } from "zustand";

// Push to the cross-store undo stack (lives in subtitle store)
function _pushCrossUndo() {
  try {
    const subStore = require("./useSubtitleStore").default;
    subStore.getState()._pushUndo();
  } catch (_) {}
}

const useCaptionStore = create((set) => ({
  captionText: "",
  captionFontFamily: "Latina Essential",
  captionFontWeight: 900,
  captionFontSize: 30,
  captionColor: "#ffffff",
  captionBold: true,
  captionItalic: true,
  captionUnderline: false,
  captionLineSpacing: 1.3,
  captionShadowOn: false,
  captionShadowColor: "#000000",
  captionShadowBlur: 8,
  captionShadowOpacity: 60,
  captionStrokeOn: false,
  captionStrokeColor: "#000000",
  captionStrokeWidth: 2,
  captionStrokeOpacity: 80,

  // ── Caption timing (for timeline resize) ──
  captionStartSec: 0,
  captionEndSec: null, // null = use full clip duration

  // ── Actions (all styling setters push cross-store undo) ──
  setCaptionText: (text) => { _pushCrossUndo(); set({ captionText: text }); },
  setCaptionFontFamily: (f) => { _pushCrossUndo(); set({ captionFontFamily: f }); },
  setCaptionFontWeight: (w) => { _pushCrossUndo(); set({ captionFontWeight: w }); },
  setCaptionFontSize: (s) => { _pushCrossUndo(); set({ captionFontSize: s }); },
  setCaptionColor: (c) => { _pushCrossUndo(); set({ captionColor: c }); },
  setCaptionBold: (b) => { _pushCrossUndo(); set({ captionBold: b }); },
  setCaptionItalic: (i) => { _pushCrossUndo(); set({ captionItalic: i }); },
  setCaptionUnderline: (u) => { _pushCrossUndo(); set({ captionUnderline: u }); },
  toggleBold: () => { _pushCrossUndo(); set((s) => ({ captionBold: !s.captionBold })); },
  toggleItalic: () => { _pushCrossUndo(); set((s) => ({ captionItalic: !s.captionItalic })); },
  toggleUnderline: () => { _pushCrossUndo(); set((s) => ({ captionUnderline: !s.captionUnderline })); },
  setCaptionLineSpacing: (v) => { _pushCrossUndo(); set({ captionLineSpacing: v }); },
  setCaptionShadowOn: (v) => { _pushCrossUndo(); set({ captionShadowOn: v }); },
  setCaptionShadowColor: (c) => { _pushCrossUndo(); set({ captionShadowColor: c }); },
  setCaptionShadowBlur: (b) => { _pushCrossUndo(); set({ captionShadowBlur: b }); },
  setCaptionShadowOpacity: (o) => { _pushCrossUndo(); set({ captionShadowOpacity: o }); },
  setCaptionStrokeOn: (v) => { _pushCrossUndo(); set({ captionStrokeOn: v }); },
  setCaptionStrokeColor: (c) => { _pushCrossUndo(); set({ captionStrokeColor: c }); },
  setCaptionStrokeWidth: (w) => { _pushCrossUndo(); set({ captionStrokeWidth: w }); },
  setCaptionStrokeOpacity: (o) => { _pushCrossUndo(); set({ captionStrokeOpacity: o }); },
  setCaptionStartSec: (t) => set({ captionStartSec: t }),
  setCaptionEndSec: (t) => set({ captionEndSec: t }),

  initFromClip: (clip) => {
    set({
      captionText: clip?.caption || clip?.title || "",
      captionStartSec: 0,
      captionEndSec: null,
    });
  },

  reset: () => set({
    captionText: "",
    captionFontFamily: "Latina Essential",
    captionFontWeight: 900,
    captionFontSize: 30,
    captionColor: "#ffffff",
    captionBold: true,
    captionItalic: true,
    captionUnderline: false,
    captionStartSec: 0,
    captionEndSec: null,
  }),
}));

export default useCaptionStore;
