import { create } from "zustand";

// Push to the cross-store undo stack (lives in subtitle store)
function _pushCrossUndo() {
  try {
    const subStore = require("./useSubtitleStore").default;
    subStore.getState()._pushUndo();
  } catch (_) {}
}

let _nextCapId = 1;

const useCaptionStore = create((set, get) => ({
  // ── Caption segments (array — supports multiple, overlapping captions) ──
  captionSegments: [],
  // Backwards-compat: derived from first segment (used by legacy consumers)
  captionText: "",

  // ── Global styling (shared across all caption segments) ──
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
  captionEffectOrder: ["glow", "stroke", "shadow", "background"],

  // ── Deprecated timing fields — kept for undo snapshot compat ──
  captionStartSec: 0,
  captionEndSec: null,

  // ── Segment CRUD ──
  addCaptionSegment: (text, startSec, endSec) => {
    _pushCrossUndo();
    const id = `cap-${_nextCapId++}`;
    set((s) => ({
      captionSegments: [...s.captionSegments, { id, text, startSec, endSec }],
      captionText: s.captionSegments.length === 0 ? text : s.captionText,
    }));
    return id;
  },

  updateCaptionSegmentText: (segId, text) => {
    _pushCrossUndo();
    set((s) => {
      const segs = s.captionSegments.map((seg) =>
        seg.id === segId ? { ...seg, text } : seg
      );
      // Keep captionText in sync with first segment
      const firstText = segs.length > 0 ? segs[0].text : "";
      return { captionSegments: segs, captionText: firstText };
    });
  },

  updateCaptionSegmentTimes: (segId, startSec, endSec) => {
    set((s) => ({
      captionSegments: s.captionSegments.map((seg) =>
        seg.id === segId ? { ...seg, startSec, endSec } : seg
      ),
    }));
  },

  deleteCaptionSegment: (segId) => {
    _pushCrossUndo();
    set((s) => {
      const segs = s.captionSegments.filter((seg) => seg.id !== segId);
      const firstText = segs.length > 0 ? segs[0].text : "";
      return { captionSegments: segs, captionText: firstText };
    });
  },

  splitCaptionAtPlayhead: (time) => {
    const { captionSegments } = get();
    // Find the segment that contains the playhead
    // Resolve null endSec to Infinity for comparison (null = spans full duration)
    const seg = captionSegments.find((s) => {
      const effectiveEnd = s.endSec ?? Infinity;
      return time > s.startSec + 0.001 && time < effectiveEnd - 0.001;
    });
    if (!seg) return;

    _pushCrossUndo();
    const newId = `cap-${_nextCapId++}`;
    set((s) => ({
      captionSegments: s.captionSegments.flatMap((s2) => {
        if (s2.id !== seg.id) return [s2];
        // Split into two independent segments with independent text copies
        return [
          { ...s2, endSec: time },
          { id: newId, text: s2.text, startSec: time, endSec: s2.endSec },
        ];
      }),
    }));
    return newId;
  },

  // ── Legacy setter — updates first segment's text (for backwards compat) ──
  setCaptionText: (text) => {
    _pushCrossUndo();
    set((s) => {
      if (s.captionSegments.length === 0) {
        // Auto-create a segment so the preview can render it
        if (text) {
          const id = `cap-${_nextCapId++}`;
          return {
            captionText: text,
            captionSegments: [{ id, text, startSec: 0, endSec: null }],
          };
        }
        return { captionText: text };
      }
      // Update first segment's text
      const segs = [...s.captionSegments];
      segs[0] = { ...segs[0], text };
      return { captionSegments: segs, captionText: text };
    });
  },

  // ── Legacy timing setters — update first segment's timing ──
  setCaptionStartSec: (t) => set((s) => {
    if (s.captionSegments.length === 0) return { captionStartSec: t };
    const segs = [...s.captionSegments];
    segs[0] = { ...segs[0], startSec: t };
    return { captionSegments: segs, captionStartSec: t };
  }),
  setCaptionEndSec: (t) => set((s) => {
    if (s.captionSegments.length === 0) return { captionEndSec: t };
    const segs = [...s.captionSegments];
    segs[0] = { ...segs[0], endSec: t };
    return { captionSegments: segs, captionEndSec: t };
  }),

  // ── Actions (all styling setters push cross-store undo) ──
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
  setCaptionEffectOrder: (order) => { _pushCrossUndo(); set({ captionEffectOrder: order }); },

  initFromClip: (clip) => {
    const text = clip?.caption || clip?.title || "";
    const savedSegments = clip?.captionSegments;

    if (Array.isArray(savedSegments) && savedSegments.length > 0) {
      // Restore saved caption segments
      _nextCapId = Math.max(...savedSegments.map((s) => {
        const n = parseInt((s.id || "").replace("cap-", ""), 10);
        return isNaN(n) ? 0 : n;
      })) + 1;
      set({
        captionSegments: savedSegments,
        captionText: savedSegments[0]?.text || text,
        captionStartSec: savedSegments[0]?.startSec || 0,
        captionEndSec: savedSegments[0]?.endSec || null,
      });
    } else {
      // Legacy: create single segment from captionText
      _nextCapId = 1;
      const id = `cap-${_nextCapId++}`;
      set({
        captionSegments: text ? [{ id, text, startSec: 0, endSec: null }] : [],
        captionText: text,
        captionStartSec: 0,
        captionEndSec: null,
      });
    }
  },

  reset: () => {
    _nextCapId = 1;
    set({
      captionSegments: [],
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
    });
  },
}));

export default useCaptionStore;
