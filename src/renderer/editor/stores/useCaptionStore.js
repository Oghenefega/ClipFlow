import { create } from "zustand";

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

  // ── Actions ──
  setCaptionText: (text) => set({ captionText: text }),
  setCaptionFontFamily: (f) => set({ captionFontFamily: f }),
  setCaptionFontWeight: (w) => set({ captionFontWeight: w }),
  setCaptionFontSize: (s) => set({ captionFontSize: s }),
  setCaptionColor: (c) => set({ captionColor: c }),
  setCaptionBold: (b) => set({ captionBold: b }),
  setCaptionItalic: (i) => set({ captionItalic: i }),
  setCaptionUnderline: (u) => set({ captionUnderline: u }),
  toggleBold: () => set((s) => ({ captionBold: !s.captionBold })),
  toggleItalic: () => set((s) => ({ captionItalic: !s.captionItalic })),
  toggleUnderline: () => set((s) => ({ captionUnderline: !s.captionUnderline })),
  setCaptionLineSpacing: (v) => set({ captionLineSpacing: v }),
  setCaptionShadowOn: (v) => set({ captionShadowOn: v }),
  setCaptionShadowColor: (c) => set({ captionShadowColor: c }),
  setCaptionShadowBlur: (b) => set({ captionShadowBlur: b }),
  setCaptionShadowOpacity: (o) => set({ captionShadowOpacity: o }),
  setCaptionStrokeOn: (v) => set({ captionStrokeOn: v }),
  setCaptionStrokeColor: (c) => set({ captionStrokeColor: c }),
  setCaptionStrokeWidth: (w) => set({ captionStrokeWidth: w }),
  setCaptionStrokeOpacity: (o) => set({ captionStrokeOpacity: o }),
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
