import { create } from "zustand";
import { fmtTime } from "../utils/timeUtils";

// ── Cross-store styling snapshot keys ──
// These keys are captured in undo snapshots so styling changes are undoable.
const SUB_STYLE_KEYS = [
  "subMode", "fontSize", "strokeWidth", "strokeColor", "strokeOpacity", "strokeOn",
  "strokeBlur", "strokeOffsetX", "strokeOffsetY",
  "shadowOn", "shadowBlur", "shadowColor", "shadowOpacity", "shadowOffsetX", "shadowOffsetY",
  "glowOn", "glowColor", "glowOpacity", "glowIntensity", "glowBlur", "glowBlend", "glowOffsetX", "glowOffsetY",
  "bgOn", "bgOpacity", "bgColor", "bgPaddingX", "bgPaddingY", "bgRadius",
  "highlightColor", "subColor", "subPos", "punctOn", "showSubs", "emojiOn",
  "subFontFamily", "subFontWeight", "subItalic", "subBold", "subUnderline",
  "lineMode", "syncOffset", "punctuationRemove", "effectOrder",
  "animateOn", "animateScale", "animateGrowFrom", "animateSpeed",
];

// Snapshot/restore helpers for cross-store undo
function _snapshotStyling(subState) {
  const sub = {};
  for (const k of SUB_STYLE_KEYS) sub[k] = subState[k];
  // Deep-copy objects/arrays
  if (sub.punctuationRemove) sub.punctuationRemove = { ...sub.punctuationRemove };
  if (sub.effectOrder) sub.effectOrder = [...sub.effectOrder];

  // Capture caption store state (lazy import to avoid circular deps)
  let cap = null;
  try {
    const capStore = require("./useCaptionStore").default;
    const cs = capStore.getState();
    const CAP_KEYS = [
      "captionText", "captionSegments",
      "captionFontFamily", "captionFontWeight", "captionFontSize",
      "captionColor", "captionBold", "captionItalic", "captionUnderline",
      "captionLineSpacing",
      "captionShadowOn", "captionShadowColor", "captionShadowBlur", "captionShadowOpacity",
      "captionShadowOffsetX", "captionShadowOffsetY",
      "captionStrokeOn", "captionStrokeColor", "captionStrokeWidth", "captionStrokeOpacity",
      "captionStrokeBlur", "captionStrokeOffsetX", "captionStrokeOffsetY",
      "captionGlowOn", "captionGlowColor", "captionGlowOpacity", "captionGlowIntensity",
      "captionGlowBlur", "captionGlowBlend", "captionGlowOffsetX", "captionGlowOffsetY",
      "captionBgOn", "captionBgColor", "captionBgOpacity", "captionBgPaddingX",
      "captionBgPaddingY", "captionBgRadius", "captionEffectOrder",
    ];
    cap = {};
    for (const k of CAP_KEYS) {
      const val = cs[k];
      // Deep-copy captionSegments array of objects
      if (k === "captionSegments" && Array.isArray(val)) {
        cap[k] = val.map((seg) => ({ ...seg }));
      } else {
        cap[k] = Array.isArray(val) ? [...val] : val;
      }
    }
  } catch (_) {}

  // Capture layout positions
  let layout = null;
  try {
    const layoutStore = require("./useLayoutStore").default;
    const ls = layoutStore.getState();
    layout = {
      subYPercent: ls.subYPercent, capYPercent: ls.capYPercent, capWidthPercent: ls.capWidthPercent,
    };
  } catch (_) {}

  return { sub, cap, layout };
}

function _restoreStyling(snapshot, subSet) {
  if (!snapshot) return;
  // Restore subtitle styling
  if (snapshot.sub) subSet(snapshot.sub);
  // Restore caption store
  if (snapshot.cap) {
    try {
      const capStore = require("./useCaptionStore").default;
      capStore.setState(snapshot.cap);
    } catch (_) {}
  }
  // Restore layout positions
  if (snapshot.layout) {
    try {
      const layoutStore = require("./useLayoutStore").default;
      layoutStore.setState(snapshot.layout);
    } catch (_) {}
  }
}

// ── Merge whisper subword tokens into real words using segment text as ground truth ──
// Whisper/whisperx tokenizes at subword level: "raiders" → ["ra","iders"],
// "Bioscanner" → ["bios","c","anner"], "Reagents" → ["reag","ents"]
// We use the segment's .text field (which has correct words) to guide merging.
function mergeWordTokens(words, segmentText) {
  if (!words || words.length === 0) return words;
  if (!segmentText) return words;

  // Get the real words from the segment text
  const realWords = segmentText.trim().split(/\s+/).filter(Boolean);
  if (realWords.length === 0) return words;

  const merged = [];
  let tokenIdx = 0;

  for (const realWord of realWords) {
    if (tokenIdx >= words.length) break;

    // Start building the merged word from current token
    const mergedWord = { ...words[tokenIdx] };
    let built = words[tokenIdx].word.trim();
    tokenIdx++;

    // Keep consuming tokens until we've built the full real word
    // Compare case-insensitively and strip punctuation for matching
    const realClean = realWord.replace(/[.,!?;:'"]/g, "").toLowerCase();
    let builtClean = built.replace(/[.,!?;:'"]/g, "").toLowerCase();
    let safety = 0;

    while (builtClean !== realClean && tokenIdx < words.length && safety < 10) {
      const nextToken = words[tokenIdx];
      built += nextToken.word.trim();
      builtClean = built.replace(/[.,!?;:'"]/g, "").toLowerCase();
      mergedWord.end = nextToken.end;
      tokenIdx++;
      safety++;
    }

    // Use the real word text (preserves original casing/punctuation)
    mergedWord.word = realWord;
    merged.push(mergedWord);
  }

  // If there are leftover tokens not matched to any real word, append them
  // (shouldn't happen with correct data, but don't lose anything)
  while (tokenIdx < words.length) {
    merged.push({ ...words[tokenIdx] });
    tokenIdx++;
  }

  return merged;
}

// ── Pass through word timestamps as-is ──
// Real timestamp repair happens in Python (transcribe.py) using audio energy.
// No JS-side fallbacks — if timestamps are bad, they stay bad so the root
// cause is visible and gets fixed at the source (re-generate clips).
function validateWords(words, segStart, segEnd) {
  if (!words || words.length === 0) return words;
  // Only clamp to segment boundaries — no fabrication
  return words.map(w => ({
    ...w,
    start: Math.max(segStart, Math.min(segEnd, w.start)),
    end: Math.max(segStart, Math.min(segEnd, w.end)),
  }));
}

const useSubtitleStore = create((set, get) => ({
  // ── Editable segments (source of truth for transcript, edit subs, overlay, timeline) ──
  editSegments: [],
  originalSegments: [], // preserved for segment mode switching

  // ── Undo/Redo history ──
  _undoStack: [],
  _redoStack: [],

  // ── Edit Subtitles panel ──
  esFilter: "all",
  activeSegId: null,
  selectedWordInfo: null, // { segId, wordIdx }
  editingWordKey: null,   // "segId-wordIdx" for inline transcript editing
  segmentMode: "3word", // "3word" | "1word"

  // ── Transcript ──
  transcriptSearch: "",
  activeRow: 0,

  // ── Subtitle styling ──
  subMode: "karaoke",
  fontSize: 52,
  strokeWidth: 7,
  strokeColor: "#000000",
  strokeOpacity: 100,
  strokeOn: true,
  strokeBlur: 0,
  strokeOffsetX: 0,
  strokeOffsetY: 0,
  shadowOn: false,
  shadowBlur: 8,
  shadowColor: "#000000",
  shadowOpacity: 70,
  shadowOffsetX: 4,
  shadowOffsetY: 4,
  glowOn: false,
  glowColor: "#ffffff",
  glowOpacity: 25,
  glowIntensity: 80,
  glowBlur: 15,
  glowBlend: 20,
  glowOffsetX: 0,
  glowOffsetY: 0,
  bgOn: false,
  bgOpacity: 80,
  bgColor: "#000000",
  bgPaddingX: 12,
  bgPaddingY: 8,
  bgRadius: 6,
  // Effect render order (draggable — determines layering in text-shadow)
  effectOrder: ["glow", "stroke", "shadow", "background"],
  highlightColor: "#4cce8a",
  subColor: "#ffffff",
  subPos: 7,
  punctOn: false,
  showSubs: true,
  emojiOn: false,
  subFontFamily: "Latina Essential",
  subFontWeight: 900,
  subItalic: true,
  subBold: true,
  subUnderline: false,
  lineMode: "1L",
  syncOffset: 0,
  // Per-punctuation removal config
  punctuationRemove: { period: false, comma: false, question: false, exclamation: false, semicolon: false, colon: false, ellipsis: false },
  // Animation settings
  animateOn: false,
  animateScale: 1.2,       // karaoke pop scale (1.0–1.5)
  animateGrowFrom: 0.8,    // single-word start scale (0.5–1.0)
  animateSpeed: 0.2,       // transition duration in seconds (0.05–0.5)

  // ── Derived getter ──
  getTranscriptRows: () => {
    return get().editSegments.map(s => ({
      id: s.id, start: s.start, end: s.end, dur: s.dur,
      text: s.text, startSec: s.startSec, endSec: s.endSec,
    }));
  },

  // ── Init from project data ──
  initSegments: (project, clip) => {
    // Prefer clip-level transcription (from re-transcribe) over project-level
    const transcriptionSource = clip?.transcription || project?.transcription;
    if (!transcriptionSource?.segments || !clip) {
      set({ editSegments: [], activeSegId: null });
      return;
    }
    // If clip has its own transcription, segments are already clip-relative (start from 0)
    const hasClipTranscription = !!clip?.transcription;
    const clipStart = hasClipTranscription ? 0 : (clip.startTime || 0);
    // Use Infinity as fallback when endTime is missing/zero — never filter out all segments
    const rawEnd = hasClipTranscription ? Infinity : (clip.endTime || 0);
    const clipEnd = rawEnd > clipStart ? rawEnd : Infinity;
    const segs = transcriptionSource.segments
      .filter((s) => {
        // For clip-level transcription (clipEnd=Infinity): include all segments
        // For project-level: include segments that overlap with the clip time range
        if (clipEnd === Infinity) return s.start >= clipStart;
        return s.start < clipEnd && s.end > clipStart;
      })
      .map((s, i) => {
        const segStartSec = s.start - clipStart;
        const segEndSec = s.end - clipStart;
        // Merge subword tokens using segment text as ground truth, then clamp timestamps
        const rawWords = mergeWordTokens((s.words || []).map(w => ({
          word: w.word,
          start: Math.max(0, (w.start || 0) - clipStart),
          end: Math.max(0, (w.end || 0) - clipStart),
          probability: w.probability ?? 1,
        })), s.text);
        const repairedWords = validateWords(rawWords, segStartSec, segEndSec);
        return {
          id: i + 1,
          start: fmtTime(segStartSec),
          end: fmtTime(segEndSec),
          dur: ((s.end - s.start).toFixed(1)) + "s",
          text: s.text,
          track: "s1",
          conf: "high",
          startSec: segStartSec,
          endSec: segEndSec,
          warning: (s.end - s.start) > 10 ? "Long segment — consider splitting" : null,
          words: repairedWords,
        };
      });
    // Store original sentence-level segments for transcript tab and mode switching
    set({
      originalSegments: segs,
      activeRow: 0,
      selectedWordInfo: null,
      editingWordKey: null,
    });
    // Default to 3-word chunking for edit subtitles
    get().setSegmentMode("3word");
  },

  // ── Undo/Redo actions (segments + styling across all stores) ──
  _lastUndoPushTime: 0,
  _pushUndo: () => {
    // Debounce: rapid changes within 300ms merge into one undo entry
    const now = Date.now();
    const state = get();
    if (now - state._lastUndoPushTime < 300) return;
    const snapshot = {
      editSegments: JSON.parse(JSON.stringify(state.editSegments)),
      styling: _snapshotStyling(state),
    };
    set({ _undoStack: [...state._undoStack.slice(-50), snapshot], _redoStack: [], _lastUndoPushTime: now });
  },
  undo: () => {
    const state = get();
    if (state._undoStack.length === 0) return;
    const prev = state._undoStack[state._undoStack.length - 1];
    const current = {
      editSegments: JSON.parse(JSON.stringify(state.editSegments)),
      styling: _snapshotStyling(state),
    };
    set({
      _undoStack: state._undoStack.slice(0, -1),
      _redoStack: [...state._redoStack, current],
      editSegments: prev.editSegments,
    });
    _restoreStyling(prev.styling, set);
  },
  redo: () => {
    const state = get();
    if (state._redoStack.length === 0) return;
    const next = state._redoStack[state._redoStack.length - 1];
    const current = {
      editSegments: JSON.parse(JSON.stringify(state.editSegments)),
      styling: _snapshotStyling(state),
    };
    set({
      _redoStack: state._redoStack.slice(0, -1),
      _undoStack: [...state._undoStack, current],
      editSegments: next.editSegments,
    });
    _restoreStyling(next.styling, set);
  },
  canUndo: () => get()._undoStack.length > 0,
  canRedo: () => get()._redoStack.length > 0,

  // ── Segment actions ──
  setEditSegments: (segs) => set({ editSegments: typeof segs === "function" ? segs(get().editSegments) : segs }),
  setActiveSegId: (id) => set({ activeSegId: id }),
  setSelectedWordInfo: (info) => set({ selectedWordInfo: info }),
  setEditingWordKey: (key) => set({ editingWordKey: key }),
  setEsFilter: (f) => set({ esFilter: f }),
  setTranscriptSearch: (s) => set({ transcriptSearch: s }),
  setActiveRow: (r) => set({ activeRow: r }),

  updateSegmentText: (segId, text) => {
    get()._pushUndo();
    set((s) => ({
      editSegments: s.editSegments.map(seg =>
        seg.id === segId ? { ...seg, text } : seg
      ),
    }));
  },

  updateWordInSegment: (segId, wordIdx, newText) => {
    get()._pushUndo();
    set((s) => ({
      editSegments: s.editSegments.map(seg => {
        if (seg.id !== segId) return seg;
        const textWords = seg.text.split(/\s+/).filter(Boolean);
        if (wordIdx < 0 || wordIdx >= textWords.length) return seg;
        textWords[wordIdx] = newText;
        const updatedSeg = { ...seg, text: textWords.join(" ") };
        // Also update words array if present
        if (updatedSeg.words && updatedSeg.words[wordIdx]) {
          updatedSeg.words = [...updatedSeg.words];
          updatedSeg.words[wordIdx] = { ...updatedSeg.words[wordIdx], word: newText };
        }
        return updatedSeg;
      }),
    }));
  },

  updateSegmentTimes: (segId, startSec, endSec) => {
    get()._pushUndo();
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

  splitSegment: (atTime) => {
    const { activeSegId, editSegments, selectedWordInfo, _pushUndo } = get();

    // If a specific time is given, find the segment containing that time
    // Otherwise fall back to activeSegId
    let targetSegId = activeSegId;
    if (atTime != null) {
      // Use minimal buffer (0.001s = 1ms) to find containing segment
      const found = editSegments.find(s => atTime >= s.startSec + 0.001 && atTime <= s.endSec - 0.001);
      if (found) targetSegId = found.id;
    }
    if (!targetSegId) return;

    const idx = editSegments.findIndex(s => s.id === targetSegId);
    if (idx < 0) return;
    _pushUndo();
    const seg = editSegments[idx];
    const textWords = seg.text.split(/\s+/).filter(Boolean);
    if (textWords.length === 0) return;

    // Determine split time and word boundary
    let splitSec;
    let splitWordIdx;

    if (atTime != null && atTime > seg.startSec + 0.001 && atTime < seg.endSec - 0.001) {
      // Split at the given time — find the nearest word boundary
      splitSec = atTime;
      if (seg.words && seg.words.length > 0) {
        // Find the word index where the split falls
        splitWordIdx = seg.words.findIndex(w => w.start >= splitSec);
        if (splitWordIdx <= 0) splitWordIdx = Math.max(1, Math.floor(seg.words.length / 2));
        // Map word index back to text word index
        const textWordIdx = Math.min(splitWordIdx, textWords.length - 1);
        splitWordIdx = Math.max(1, textWordIdx);
      } else {
        // No word timestamps — estimate by position in segment
        const frac = (splitSec - seg.startSec) / (seg.endSec - seg.startSec);
        splitWordIdx = Math.max(1, Math.min(textWords.length - 1, Math.round(frac * textWords.length)));
      }
    } else if (selectedWordInfo && selectedWordInfo.segId === targetSegId && selectedWordInfo.wordIdx > 0) {
      splitWordIdx = selectedWordInfo.wordIdx;
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
    } else {
      splitWordIdx = Math.max(1, Math.floor(textWords.length / 2));
      splitSec = (seg.startSec + seg.endSec) / 2;
    }

    const words1 = seg.words ? seg.words.filter(w => w.end <= splitSec + 0.01) : [];
    const words2 = seg.words ? seg.words.filter(w => w.start >= splitSec - 0.01) : [];
    const seg1 = { ...seg, endSec: splitSec, end: fmtTime(splitSec), dur: (splitSec - seg.startSec).toFixed(1) + "s", text: textWords.slice(0, splitWordIdx).join(" "), words: words1 };
    const seg2 = { ...seg, id: Date.now(), startSec: splitSec, start: fmtTime(splitSec), dur: (seg.endSec - splitSec).toFixed(1) + "s", text: textWords.slice(splitWordIdx).join(" "), words: words2 };
    const next = [...editSegments];
    next.splice(idx, 1, seg1, seg2);
    set({ editSegments: next, selectedWordInfo: null, activeSegId: seg1.id });
  },

  mergeSegment: () => {
    get()._pushUndo();
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
      // Close gaps between word segments (continuous speech)
      for (let j = 0; j < wordSegs.length - 1; j++) {
        const gap = wordSegs[j + 1].startSec - wordSegs[j].endSec;
        if (gap > 0 && gap < 1.0) {
          wordSegs[j].endSec = wordSegs[j + 1].startSec;
          wordSegs[j].end = fmtTime(wordSegs[j].endSec);
          wordSegs[j].dur = (wordSegs[j].endSec - wordSegs[j].startSec).toFixed(1) + "s";
        }
      }
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
    get()._pushUndo();
    set((s) => ({ editSegments: s.editSegments.filter(seg => seg.id !== segId) }));
  },

  // ── Styling setters (all push undo for Ctrl+Z support) ──
  _pushStyleUndo: () => { get()._pushUndo(); },
  setSubMode: (m) => { get()._pushStyleUndo(); set({ subMode: m }); },
  setFontSize: (s) => { get()._pushStyleUndo(); set({ fontSize: s }); },
  setStrokeWidth: (w) => { get()._pushStyleUndo(); set({ strokeWidth: w }); },
  setStrokeColor: (c) => { get()._pushStyleUndo(); set({ strokeColor: c }); },
  setStrokeOpacity: (o) => { get()._pushStyleUndo(); set({ strokeOpacity: o }); },
  setStrokeOn: (v) => { get()._pushStyleUndo(); set({ strokeOn: v }); },
  setStrokeBlur: (b) => { get()._pushStyleUndo(); set({ strokeBlur: b }); },
  setStrokeOffsetX: (x) => { get()._pushStyleUndo(); set({ strokeOffsetX: x }); },
  setStrokeOffsetY: (y) => { get()._pushStyleUndo(); set({ strokeOffsetY: y }); },
  setShadowOn: (v) => { get()._pushStyleUndo(); set({ shadowOn: v }); },
  setShadowBlur: (b) => { get()._pushStyleUndo(); set({ shadowBlur: b }); },
  setShadowColor: (c) => { get()._pushStyleUndo(); set({ shadowColor: c }); },
  setShadowOpacity: (o) => { get()._pushStyleUndo(); set({ shadowOpacity: o }); },
  setShadowOffsetX: (x) => { get()._pushStyleUndo(); set({ shadowOffsetX: x }); },
  setShadowOffsetY: (y) => { get()._pushStyleUndo(); set({ shadowOffsetY: y }); },
  setGlowOn: (v) => { get()._pushStyleUndo(); set({ glowOn: v }); },
  setGlowColor: (c) => { get()._pushStyleUndo(); set({ glowColor: c }); },
  setGlowOpacity: (o) => { get()._pushStyleUndo(); set({ glowOpacity: o }); },
  setGlowIntensity: (i) => { get()._pushStyleUndo(); set({ glowIntensity: i }); },
  setGlowBlur: (b) => { get()._pushStyleUndo(); set({ glowBlur: b }); },
  setGlowBlend: (b) => { get()._pushStyleUndo(); set({ glowBlend: b }); },
  setGlowOffsetX: (x) => { get()._pushStyleUndo(); set({ glowOffsetX: x }); },
  setGlowOffsetY: (y) => { get()._pushStyleUndo(); set({ glowOffsetY: y }); },
  setBgOn: (v) => { get()._pushStyleUndo(); set({ bgOn: v }); },
  setBgOpacity: (o) => { get()._pushStyleUndo(); set({ bgOpacity: o }); },
  setBgColor: (c) => { get()._pushStyleUndo(); set({ bgColor: c }); },
  setBgPaddingX: (p) => { get()._pushStyleUndo(); set({ bgPaddingX: p }); },
  setBgPaddingY: (p) => { get()._pushStyleUndo(); set({ bgPaddingY: p }); },
  setBgRadius: (r) => { get()._pushStyleUndo(); set({ bgRadius: r }); },
  setEffectOrder: (order) => { get()._pushStyleUndo(); set({ effectOrder: order }); },
  setHighlightColor: (c) => { get()._pushStyleUndo(); set({ highlightColor: c }); },
  setSubColor: (c) => { get()._pushStyleUndo(); set({ subColor: c }); },
  setSubPos: (p) => { get()._pushStyleUndo(); set({ subPos: p }); },
  setPunctOn: (v) => { get()._pushStyleUndo(); set({ punctOn: v }); },
  setShowSubs: (v) => set({ showSubs: v }),
  toggleShowSubs: () => set((s) => ({ showSubs: !s.showSubs })),
  setEmojiOn: (v) => set({ emojiOn: v }),
  setSubFontFamily: (f) => { get()._pushStyleUndo(); set({ subFontFamily: f }); },
  setSubFontWeight: (w) => { get()._pushStyleUndo(); set({ subFontWeight: w }); },
  setSubItalic: (v) => { get()._pushStyleUndo(); set({ subItalic: v }); },
  setSubBold: (v) => { get()._pushStyleUndo(); set({ subBold: v }); },
  setSubUnderline: (v) => { get()._pushStyleUndo(); set({ subUnderline: v }); },
  toggleSubItalic: () => { get()._pushStyleUndo(); set((s) => ({ subItalic: !s.subItalic })); },
  toggleSubBold: () => { get()._pushStyleUndo(); set((s) => ({ subBold: !s.subBold })); },
  toggleSubUnderline: () => { get()._pushStyleUndo(); set((s) => ({ subUnderline: !s.subUnderline })); },
  setLineMode: (m) => { get()._pushStyleUndo(); set({ lineMode: m }); },
  setSyncOffset: (o) => { get()._pushStyleUndo(); set({ syncOffset: o }); },
  setPunctuationRemove: (config) => { get()._pushStyleUndo(); set({ punctuationRemove: config }); },
  setAnimateOn: (v) => { get()._pushStyleUndo(); set({ animateOn: v }); },
  setAnimateScale: (v) => { get()._pushStyleUndo(); set({ animateScale: v }); },
  setAnimateGrowFrom: (v) => { get()._pushStyleUndo(); set({ animateGrowFrom: v }); },
  setAnimateSpeed: (v) => { get()._pushStyleUndo(); set({ animateSpeed: v }); },

  // ── Segment mode switching ──
  setSegmentMode: (mode) => {
    const { originalSegments } = get();
    if (!originalSegments || originalSegments.length === 0) {
      set({ segmentMode: mode });
      return;
    }

    // Gather all words from all original segments (already merged during init)
    const allWords = [];
    originalSegments.forEach((seg) => {
      if (seg.words && seg.words.length > 0) {
        seg.words.forEach((w) => allWords.push({ ...w, track: seg.track }));
      } else {
        // Fallback: split text evenly
        const textWords = seg.text.split(/\s+/).filter(Boolean);
        const dur = seg.endSec - seg.startSec;
        const perWord = dur / textWords.length;
        textWords.forEach((tw, i) => {
          allWords.push({
            word: tw,
            start: seg.startSec + i * perWord,
            end: seg.startSec + (i + 1) * perWord,
            probability: 1,
            track: seg.track,
          });
        });
      }
    });

    const SILENCE_GAP_THRESHOLD = 1.0; // seconds — only show gaps when silence > 1s
    const chunkSize = mode === "1word" ? 1 : 3;
    const rawSegs = [];
    for (let i = 0; i < allWords.length; i += chunkSize) {
      const chunk = allWords.slice(i, i + chunkSize);
      const startSec = chunk[0].start;
      const endSec = chunk[chunk.length - 1].end;
      rawSegs.push({
        id: Date.now() + i,
        start: fmtTime(startSec),
        end: fmtTime(endSec),
        dur: (endSec - startSec).toFixed(1) + "s",
        text: chunk.map((w) => w.word).join(" "),
        track: chunk[0].track || "s1",
        conf: "high",
        startSec,
        endSec,
        warning: null,
        words: chunk,
      });
    }

    // Close gaps between segments during continuous speech.
    // If gap between seg[i].end and seg[i+1].start is < 1s, extend seg[i]
    // to touch seg[i+1] — pills should be continuous when speech is flowing.
    // Only leave a visible gap when silence exceeds 1 second.
    for (let i = 0; i < rawSegs.length - 1; i++) {
      const gap = rawSegs[i + 1].startSec - rawSegs[i].endSec;
      if (gap > 0 && gap < SILENCE_GAP_THRESHOLD) {
        // Extend current segment's end to meet the next segment's start
        rawSegs[i].endSec = rawSegs[i + 1].startSec;
        rawSegs[i].end = fmtTime(rawSegs[i].endSec);
        rawSegs[i].dur = (rawSegs[i].endSec - rawSegs[i].startSec).toFixed(1) + "s";
      }
    }

    set({ editSegments: rawSegs, segmentMode: mode, activeSegId: rawSegs[0]?.id });
  },
}));

export default useSubtitleStore;
