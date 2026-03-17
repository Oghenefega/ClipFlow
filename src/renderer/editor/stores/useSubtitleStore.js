import { create } from "zustand";
import { fmtTime } from "../utils/timeUtils";

const useSubtitleStore = create((set, get) => ({
  // ── Editable segments (source of truth for transcript, edit subs, overlay, timeline) ──
  editSegments: [],

  // ── Edit Subtitles panel ──
  esFilter: "all",
  activeSegId: null,
  selectedWordInfo: null, // { segId, wordIdx }
  editingWordKey: null,   // "segId-wordIdx" for inline transcript editing

  // ── Transcript ──
  transcriptSearch: "",
  activeRow: 0,

  // ── Subtitle styling ──
  subMode: "karaoke",
  fontSize: 52,
  strokeWidth: 7,
  strokeOn: true,
  shadowOn: false,
  shadowBlur: 8,
  bgOn: false,
  bgOpacity: 80,
  highlightColor: "#4cce8a",
  subPos: 7,
  punctOn: false,
  showSubs: true,
  emojiOn: false,
  subFontFamily: "Latina Essential",
  lineMode: "2L",
  syncOffset: 0,

  // ── Derived getter ──
  getTranscriptRows: () => {
    return get().editSegments.map(s => ({
      id: s.id, start: s.start, end: s.end, dur: s.dur,
      text: s.text, startSec: s.startSec, endSec: s.endSec,
    }));
  },

  // ── Init from project data ──
  initSegments: (project, clip) => {
    if (!project?.transcription?.segments || !clip) {
      set({ editSegments: [], activeSegId: null });
      return;
    }
    const clipStart = clip.startTime || 0;
    const clipEnd = clip.endTime || 0;
    const segs = project.transcription.segments
      .filter((s) => s.start >= clipStart && s.end <= clipEnd)
      .map((s, i) => ({
        id: i + 1,
        start: fmtTime(s.start - clipStart),
        end: fmtTime(s.end - clipStart),
        dur: ((s.end - s.start).toFixed(1)) + "s",
        text: s.text,
        track: "s1",
        conf: "high",
        startSec: s.start - clipStart,
        endSec: s.end - clipStart,
        warning: (s.end - s.start) > 10 ? "Long segment — consider splitting" : null,
        words: (s.words || []).map(w => ({
          word: w.word,
          start: Math.max(0, (w.start || 0) - clipStart),
          end: Math.max(0, (w.end || 0) - clipStart),
          probability: w.probability ?? 1,
        })),
      }));
    set({
      editSegments: segs,
      activeSegId: segs.length > 0 ? segs[0].id : null,
      activeRow: 0,
      selectedWordInfo: null,
      editingWordKey: null,
    });
  },

  // ── Segment actions ──
  setEditSegments: (segs) => set({ editSegments: typeof segs === "function" ? segs(get().editSegments) : segs }),
  setActiveSegId: (id) => set({ activeSegId: id }),
  setSelectedWordInfo: (info) => set({ selectedWordInfo: info }),
  setEditingWordKey: (key) => set({ editingWordKey: key }),
  setEsFilter: (f) => set({ esFilter: f }),
  setTranscriptSearch: (s) => set({ transcriptSearch: s }),
  setActiveRow: (r) => set({ activeRow: r }),

  updateSegmentText: (segId, text) => {
    set((s) => ({
      editSegments: s.editSegments.map(seg =>
        seg.id === segId ? { ...seg, text } : seg
      ),
    }));
  },

  updateSegmentTimes: (segId, startSec, endSec) => {
    set((s) => ({
      editSegments: s.editSegments.map(seg =>
        seg.id === segId ? {
          ...seg,
          startSec,
          endSec,
          start: fmtTime(startSec),
          end: fmtTime(endSec),
          dur: (endSec - startSec).toFixed(1) + "s",
        } : seg
      ),
    }));
  },

  splitSegment: () => {
    const { activeSegId, editSegments, selectedWordInfo } = get();
    if (!activeSegId) return;
    const idx = editSegments.findIndex(s => s.id === activeSegId);
    if (idx < 0) return;
    const seg = editSegments[idx];
    const textWords = seg.text.split(" ");
    let splitWordIdx = Math.max(1, Math.floor(textWords.length / 2));
    let splitSec = (seg.startSec + seg.endSec) / 2;
    if (selectedWordInfo && selectedWordInfo.segId === activeSegId && selectedWordInfo.wordIdx > 0) {
      splitWordIdx = selectedWordInfo.wordIdx;
      // Use actual word boundary if words array available
      if (seg.words && seg.words.length > 0 && splitWordIdx < seg.words.length) {
        splitSec = seg.words[splitWordIdx].start;
      } else {
        const segDur = seg.endSec - seg.startSec;
        splitSec = seg.startSec + (splitWordIdx / textWords.length) * segDur;
      }
    } else if (seg.words && seg.words.length > 1) {
      const midWordIdx = Math.max(1, Math.floor(seg.words.length / 2));
      splitWordIdx = midWordIdx;
      splitSec = seg.words[midWordIdx].start;
    }
    const words1 = seg.words ? seg.words.filter(w => w.end <= splitSec) : [];
    const words2 = seg.words ? seg.words.filter(w => w.start >= splitSec) : [];
    const seg1 = { ...seg, endSec: splitSec, end: fmtTime(splitSec), dur: (splitSec - seg.startSec).toFixed(1) + "s", text: textWords.slice(0, splitWordIdx).join(" "), words: words1 };
    const seg2 = { ...seg, id: Date.now(), startSec: splitSec, start: fmtTime(splitSec), dur: (seg.endSec - splitSec).toFixed(1) + "s", text: textWords.slice(splitWordIdx).join(" "), words: words2 };
    const next = [...editSegments];
    next.splice(idx, 1, seg1, seg2);
    set({ editSegments: next, selectedWordInfo: null });
  },

  mergeSegment: () => {
    const { activeSegId, editSegments } = get();
    if (!activeSegId) return;
    const idx = editSegments.findIndex(s => s.id === activeSegId);
    if (idx < 0 || idx >= editSegments.length - 1) return;
    const seg = editSegments[idx];
    const next = editSegments[idx + 1];
    const merged = { ...seg, endSec: next.endSec, end: fmtTime(next.endSec), dur: (next.endSec - seg.startSec).toFixed(1) + "s", text: seg.text + " " + next.text, words: [...(seg.words || []), ...(next.words || [])] };
    const arr = [...editSegments];
    arr.splice(idx, 2, merged);
    set({ editSegments: arr });
  },

  splitToWords: () => {
    const { activeSegId, editSegments } = get();
    if (!activeSegId) return;
    const idx = editSegments.findIndex(s => s.id === activeSegId);
    if (idx < 0) return;
    const seg = editSegments[idx];
    const textWords = seg.text.split(/\s+/).filter(Boolean);
    if (textWords.length <= 1) return;

    let wordSegs;
    if (seg.words && seg.words.length > 0) {
      // Use actual word-level timestamps
      wordSegs = seg.words.map((w, i) => ({
        ...seg,
        id: Date.now() + i,
        startSec: w.start,
        endSec: w.end,
        start: fmtTime(w.start),
        end: fmtTime(w.end),
        dur: (w.end - w.start).toFixed(1) + "s",
        text: w.word,
        words: [w],
      }));
    } else {
      // Fallback: even-split
      const totalDur = seg.endSec - seg.startSec;
      const perWord = totalDur / textWords.length;
      wordSegs = textWords.map((w, i) => ({
        ...seg,
        id: Date.now() + i,
        startSec: seg.startSec + i * perWord,
        endSec: seg.startSec + (i + 1) * perWord,
        start: fmtTime(seg.startSec + i * perWord),
        end: fmtTime(seg.startSec + (i + 1) * perWord),
        dur: perWord.toFixed(1) + "s",
        text: w,
        words: [],
      }));
    }
    const arr = [...editSegments];
    arr.splice(idx, 1, ...wordSegs);
    set({ editSegments: arr, activeSegId: wordSegs[0].id });
  },

  deleteSegment: (segId) => {
    set((s) => ({ editSegments: s.editSegments.filter(seg => seg.id !== segId) }));
  },

  // ── Styling setters ──
  setSubMode: (m) => set({ subMode: m }),
  setFontSize: (s) => set({ fontSize: s }),
  setStrokeWidth: (w) => set({ strokeWidth: w }),
  setStrokeOn: (v) => set({ strokeOn: v }),
  setShadowOn: (v) => set({ shadowOn: v }),
  setShadowBlur: (b) => set({ shadowBlur: b }),
  setBgOn: (v) => set({ bgOn: v }),
  setBgOpacity: (o) => set({ bgOpacity: o }),
  setHighlightColor: (c) => set({ highlightColor: c }),
  setSubPos: (p) => set({ subPos: p }),
  setPunctOn: (v) => set({ punctOn: v }),
  setShowSubs: (v) => set({ showSubs: v }),
  toggleShowSubs: () => set((s) => ({ showSubs: !s.showSubs })),
  setEmojiOn: (v) => set({ emojiOn: v }),
  setSubFontFamily: (f) => set({ subFontFamily: f }),
  setLineMode: (m) => set({ lineMode: m }),
  setSyncOffset: (o) => set({ syncOffset: o }),
}));

export default useSubtitleStore;
