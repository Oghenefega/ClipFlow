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
  captionStrokeBlur: 0,
  captionStrokeOffsetX: 0,
  captionStrokeOffsetY: 0,
  captionGlowOn: false,
  captionGlowColor: "#ffffff",
  captionGlowOpacity: 25,
  captionGlowIntensity: 80,
  captionGlowBlur: 15,
  captionGlowBlend: 20,
  captionGlowOffsetX: 0,
  captionGlowOffsetY: 0,
  captionShadowOffsetX: 4,
  captionShadowOffsetY: 4,
  captionBgOn: false,
  captionBgColor: "#000000",
  captionBgOpacity: 70,
  captionBgPaddingX: 12,
  captionBgPaddingY: 8,
  captionBgRadius: 6,

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
  setCaptionStrokeBlur: (b) => { _pushCrossUndo(); set({ captionStrokeBlur: b }); },
  setCaptionStrokeOffsetX: (x) => { _pushCrossUndo(); set({ captionStrokeOffsetX: x }); },
  setCaptionStrokeOffsetY: (y) => { _pushCrossUndo(); set({ captionStrokeOffsetY: y }); },
  setCaptionGlowOn: (v) => { _pushCrossUndo(); set({ captionGlowOn: v }); },
  setCaptionGlowColor: (c) => { _pushCrossUndo(); set({ captionGlowColor: c }); },
  setCaptionGlowOpacity: (o) => { _pushCrossUndo(); set({ captionGlowOpacity: o }); },
  setCaptionGlowIntensity: (i) => { _pushCrossUndo(); set({ captionGlowIntensity: i }); },
  setCaptionGlowBlur: (b) => { _pushCrossUndo(); set({ captionGlowBlur: b }); },
  setCaptionGlowBlend: (b) => { _pushCrossUndo(); set({ captionGlowBlend: b }); },
  setCaptionGlowOffsetX: (x) => { _pushCrossUndo(); set({ captionGlowOffsetX: x }); },
  setCaptionGlowOffsetY: (y) => { _pushCrossUndo(); set({ captionGlowOffsetY: y }); },
  setCaptionShadowOffsetX: (x) => { _pushCrossUndo(); set({ captionShadowOffsetX: x }); },
  setCaptionShadowOffsetY: (y) => { _pushCrossUndo(); set({ captionShadowOffsetY: y }); },
  setCaptionBgOn: (v) => { _pushCrossUndo(); set({ captionBgOn: v }); },
  setCaptionBgColor: (c) => { _pushCrossUndo(); set({ captionBgColor: c }); },
  setCaptionBgOpacity: (o) => { _pushCrossUndo(); set({ captionBgOpacity: o }); },
  setCaptionBgPaddingX: (p) => { _pushCrossUndo(); set({ captionBgPaddingX: p }); },
  setCaptionBgPaddingY: (p) => { _pushCrossUndo(); set({ captionBgPaddingY: p }); },
  setCaptionBgRadius: (r) => { _pushCrossUndo(); set({ captionBgRadius: r }); },
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
