import { create } from "zustand";
import { fmtTime } from "../utils/timeUtils";

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
  shadowOn: false,
  shadowBlur: 8,
  shadowColor: "#000000",
  shadowOpacity: 70,
  bgOn: false,
  bgOpacity: 80,
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
    const clipEnd = hasClipTranscription ? Infinity : (clip.endTime || 0);
    const segs = transcriptionSource.segments
      .filter((s) => s.start >= clipStart && (clipEnd === Infinity || s.end <= clipEnd))
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

  // ── Undo/Redo actions ──
  _pushUndo: () => {
    const { editSegments, _undoStack } = get();
    const snapshot = JSON.parse(JSON.stringify(editSegments));
    set({ _undoStack: [..._undoStack.slice(-50), snapshot], _redoStack: [] });
  },
  undo: () => {
    const { _undoStack, editSegments } = get();
    if (_undoStack.length === 0) return;
    const prev = _undoStack[_undoStack.length - 1];
    set({
      _undoStack: _undoStack.slice(0, -1),
      _redoStack: [...get()._redoStack, JSON.parse(JSON.stringify(editSegments))],
      editSegments: prev,
    });
  },
  redo: () => {
    const { _redoStack, editSegments } = get();
    if (_redoStack.length === 0) return;
    const next = _redoStack[_redoStack.length - 1];
    set({
      _redoStack: _redoStack.slice(0, -1),
      _undoStack: [...get()._undoStack, JSON.parse(JSON.stringify(editSegments))],
      editSegments: next,
    });
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

  splitSegment: () => {
    const { activeSegId, editSegments, selectedWordInfo, _pushUndo } = get();
    if (!activeSegId) return;
    _pushUndo();
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

  // ── Styling setters ──
  setSubMode: (m) => set({ subMode: m }),
  setFontSize: (s) => set({ fontSize: s }),
  setStrokeWidth: (w) => set({ strokeWidth: w }),
  setStrokeColor: (c) => set({ strokeColor: c }),
  setStrokeOpacity: (o) => set({ strokeOpacity: o }),
  setStrokeOn: (v) => set({ strokeOn: v }),
  setShadowOn: (v) => set({ shadowOn: v }),
  setShadowBlur: (b) => set({ shadowBlur: b }),
  setShadowColor: (c) => set({ shadowColor: c }),
  setShadowOpacity: (o) => set({ shadowOpacity: o }),
  setBgOn: (v) => set({ bgOn: v }),
  setBgOpacity: (o) => set({ bgOpacity: o }),
  setHighlightColor: (c) => set({ highlightColor: c }),
  setSubColor: (c) => set({ subColor: c }),
  setSubPos: (p) => set({ subPos: p }),
  setPunctOn: (v) => set({ punctOn: v }),
  setShowSubs: (v) => set({ showSubs: v }),
  toggleShowSubs: () => set((s) => ({ showSubs: !s.showSubs })),
  setEmojiOn: (v) => set({ emojiOn: v }),
  setSubFontFamily: (f) => set({ subFontFamily: f }),
  setSubFontWeight: (w) => set({ subFontWeight: w }),
  setSubItalic: (v) => set({ subItalic: v }),
  setSubBold: (v) => set({ subBold: v }),
  setSubUnderline: (v) => set({ subUnderline: v }),
  toggleSubItalic: () => set((s) => ({ subItalic: !s.subItalic })),
  toggleSubBold: () => set((s) => ({ subBold: !s.subBold })),
  toggleSubUnderline: () => set((s) => ({ subUnderline: !s.subUnderline })),
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
