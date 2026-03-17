import { create } from "zustand";

const useCaptionStore = create((set) => ({
  captionText: "",
  captionFontFamily: "Latina Essential",
  captionFontWeight: 700,
  captionFontSize: 12,
  captionColor: "#ffffff",
  captionBold: true,
  captionItalic: false,
  captionUnderline: false,

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

  initFromClip: (clip) => {
    set({
      captionText: clip?.caption || clip?.title || "",
    });
  },

  reset: () => set({
    captionText: "",
    captionFontFamily: "Latina Essential",
    captionFontWeight: 700,
    captionFontSize: 12,
    captionColor: "#ffffff",
    captionBold: true,
    captionItalic: false,
    captionUnderline: false,
  }),
}));

export default useCaptionStore;
