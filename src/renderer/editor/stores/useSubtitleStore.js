import { create } from "zustand";
import { fmtTime } from "../utils/timeUtils";

// ── Merge whisper subword tokens into real words ──
// Whisper tokenizes at subword level: "I'm" → ["I", "'m"], "raiders" → ["ra","iders"]
// Merge tokens starting with apostrophe (contractions)
function mergeWordTokens(words) {
  if (!words || words.length <= 1) return words;
  const merged = [{ ...words[0] }];
  for (let i = 1; i < words.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = words[i];
    const isContraction = curr.word.startsWith("'") || curr.word.startsWith("\u2019");
    if (isContraction) {
      prev.word += curr.word;
      prev.end = curr.end;
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

// ── JS-side word timestamp repair (fallback for already-transcribed clips) ──
// The main repair happens in Python (transcribe.py) using audio energy.
// This is a lightweight fallback for clips transcribed before that fix.
function repairWordTimestamps(words, segStart, segEnd) {
  if (!words || words.length === 0) return words;
  const segDur = segEnd - segStart;
  const n = words.length;

  // Detect broken timestamps
  let isBroken = segDur < 0.05;
  if (!isBroken && n > 1) {
    // Check bunching: >50% of words share a start time (within 50ms)
    const rounded = words.map(w => Math.round(w.start * 20) / 20);
    if (new Set(rounded).size / n < 0.5) isBroken = true;
    // Check coverage: words span <30% of segment
    if (!isBroken) {
      const span = Math.max(...words.map(w => w.end)) - Math.min(...words.map(w => w.start));
      if (segDur > 0 && span / segDur < 0.3) isBroken = true;
    }
    // Check zero-duration words (>40%)
    if (!isBroken) {
      const zeroDur = words.filter(w => (w.end - w.start) < 0.02).length;
      if (zeroDur / n > 0.4) isBroken = true;
    }
    // Check monotonicity
    if (!isBroken) {
      for (let i = 1; i < n; i++) {
        if (words[i].start < words[i-1].start - 0.01) { isBroken = true; break; }
      }
    }
  }

  if (isBroken) {
    // Even distribution fallback
    const dur = Math.max(0.05, segDur);
    const perWord = dur / n;
    return words.map((w, i) => ({
      ...w,
      start: segStart + i * perWord,
      end: segStart + (i + 1) * perWord,
    }));
  }

  // Timestamps look OK — clamp to segment boundaries + enforce min duration
  return words.map(w => ({
    ...w,
    start: Math.max(segStart, Math.min(segEnd, w.start)),
    end: Math.max(Math.max(segStart, w.start) + 0.02, Math.min(segEnd, w.end)),
  }));
}

const useSubtitleStore = create((set, get) => ({
  // ── Editable segments (source of truth for transcript, edit subs, overlay, timeline) ──
  editSegments: [],
  originalSegments: [], // preserved for segment mode switching

  // ── Edit Subtitles panel ──
  esFilter: "all",
  activeSegId: null,
  selectedWordInfo: null, // { segId, wordIdx }
  editingWordKey: null,   // "segId-wordIdx" for inline transcript editing
  segmentMode: "sentence", // "sentence" | "3word" | "1word"

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
  subFontWeight: 700,
  lineMode: "2L",
  syncOffset: 0,
  // Per-punctuation removal config
  punctuationRemove: { period: false, comma: false, question: false, exclamation: false, semicolon: false, colon: false, ellipsis: false },

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
      .map((s, i) => {
        const segStartSec = s.start - clipStart;
        const segEndSec = s.end - clipStart;
        // Merge subword tokens, then repair broken timestamps
        const rawWords = mergeWordTokens((s.words || []).map(w => ({
          word: w.word,
          start: Math.max(0, (w.start || 0) - clipStart),
          end: Math.max(0, (w.end || 0) - clipStart),
          probability: w.probability ?? 1,
        })));
        const repairedWords = repairWordTimestamps(rawWords, segStartSec, segEndSec);
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
    set({
      editSegments: segs,
      originalSegments: segs, // preserve for segment mode switching
      activeSegId: segs.length > 0 ? segs[0].id : null,
      activeRow: 0,
      selectedWordInfo: null,
      editingWordKey: null,
      segmentMode: "sentence",
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

  updateWordInSegment: (segId, wordIdx, newText) => {
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
  setSubFontWeight: (w) => set({ subFontWeight: w }),
  setLineMode: (m) => set({ lineMode: m }),
  setSyncOffset: (o) => set({ syncOffset: o }),
  setPunctuationRemove: (config) => set({ punctuationRemove: config }),

  // ── Segment mode switching ──
  setSegmentMode: (mode) => {
    const { originalSegments } = get();
    if (!originalSegments || originalSegments.length === 0) {
      set({ segmentMode: mode });
      return;
    }

    if (mode === "sentence") {
      set({ editSegments: originalSegments, segmentMode: mode, activeSegId: originalSegments[0]?.id });
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

    const chunkSize = mode === "1word" ? 1 : 3;
    const newSegs = [];
    for (let i = 0; i < allWords.length; i += chunkSize) {
      const chunk = allWords.slice(i, i + chunkSize);
      const startSec = chunk[0].start;
      const endSec = chunk[chunk.length - 1].end;
      newSegs.push({
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
    set({ editSegments: newSegs, segmentMode: mode, activeSegId: newSegs[0]?.id });
  },
}));

export default useSubtitleStore;
