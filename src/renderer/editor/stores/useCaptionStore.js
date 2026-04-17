import { create } from "zustand";
// Cross-store import — accessed only inside _pushCrossUndo (after init),
// ESM live bindings resolve the cycle.
import useSubtitleStore from "./useSubtitleStore";

// Push to the cross-store undo stack (lives in subtitle store)
function _pushCrossUndo() {
  try {
    useSubtitleStore.getState()._pushUndo();
  } catch (_) {}
}

let _nextCapId = 1;

const useCaptionStore = create((set, get) => ({
  // ── Caption segments (array — supports multiple, overlapping captions) ──
  captionSegments: [],
  // Which caption segment is currently selected/active in the timeline
  activeCaptionId: null,
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

  rippleDeleteCaptionSegment: (segId) => {
    _pushCrossUndo();
    const { captionSegments } = get();
    const seg = captionSegments.find(s => s.id === segId);
    if (!seg) return;
    const gap = (seg.endSec ?? 0) - seg.startSec;
    const next = captionSegments
      .filter(s => s.id !== segId)
      .map(s => {
        if (s.startSec >= (seg.endSec ?? 0)) {
          return { ...s, startSec: s.startSec - gap, endSec: s.endSec != null ? s.endSec - gap : s.endSec };
        }
        return s;
      });
    const firstText = next.length > 0 ? next[0].text : "";
    set({ captionSegments: next, captionText: firstText });
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

  setActiveCaptionId: (id) => set({ activeCaptionId: id }),

  // Direct setter for caption segments array (used by auto-trim)
  setCaptionSegments: (segs) => {
    const firstText = segs.length > 0 ? segs[0].text : "";
    set({ captionSegments: segs, captionText: firstText });
  },

  // ── Text setter — updates the ACTIVE segment (or first if none selected) ──
  setCaptionText: (text) => {
    _pushCrossUndo();
    set((s) => {
      if (s.captionSegments.length === 0) {
        // Auto-create a segment so the preview can render it
        if (text) {
          const id = `cap-${_nextCapId++}`;
          return {
            captionText: text,
            activeCaptionId: id,
            captionSegments: [{ id, text, startSec: 0, endSec: null }],
          };
        }
        return { captionText: text };
      }
      // Find the active segment (or fall back to first)
      const targetId = s.activeCaptionId || s.captionSegments[0]?.id;
      const segs = s.captionSegments.map((seg) =>
        seg.id === targetId ? { ...seg, text } : seg
      );
      const firstText = segs.length > 0 ? segs[0].text : "";
      return { captionSegments: segs, captionText: firstText };
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

  // ── Restore saved styling from clip.captionStyle (persisted by handleSave) ──
  // Called after applyTemplate() so saved customizations override template defaults.
  restoreSavedStyle: (saved) => {
    if (!saved || typeof saved !== "object") return;
    const mapping = {
      fontFamily: "captionFontFamily", fontWeight: "captionFontWeight",
      fontSize: "captionFontSize", bold: "captionBold", italic: "captionItalic",
      underline: "captionUnderline", color: "captionColor",
      lineSpacing: "captionLineSpacing",
      strokeOn: "captionStrokeOn", strokeColor: "captionStrokeColor",
      strokeWidth: "captionStrokeWidth", strokeOpacity: "captionStrokeOpacity",
      strokeBlur: "captionStrokeBlur", strokeOffsetX: "captionStrokeOffsetX", strokeOffsetY: "captionStrokeOffsetY",
      shadowOn: "captionShadowOn", shadowColor: "captionShadowColor",
      shadowBlur: "captionShadowBlur", shadowOpacity: "captionShadowOpacity",
      shadowOffsetX: "captionShadowOffsetX", shadowOffsetY: "captionShadowOffsetY",
      glowOn: "captionGlowOn", glowColor: "captionGlowColor",
      glowOpacity: "captionGlowOpacity", glowIntensity: "captionGlowIntensity",
      glowBlur: "captionGlowBlur", glowBlend: "captionGlowBlend",
      glowOffsetX: "captionGlowOffsetX", glowOffsetY: "captionGlowOffsetY",
      bgOn: "captionBgOn", bgColor: "captionBgColor",
      bgOpacity: "captionBgOpacity", bgPaddingX: "captionBgPaddingX",
      bgPaddingY: "captionBgPaddingY", bgRadius: "captionBgRadius",
    };
    const patch = {};
    for (const [savedKey, storeKey] of Object.entries(mapping)) {
      if (saved[savedKey] !== undefined) patch[storeKey] = saved[savedKey];
    }
    if (Object.keys(patch).length > 0) set(patch);
  },

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
