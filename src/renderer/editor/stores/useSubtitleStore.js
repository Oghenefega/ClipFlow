import { create } from "zustand";
import { fmtTime } from "../utils/timeUtils";
import { segmentWords } from "../utils/segmentWords";
import { cleanWordTimestamps } from "../utils/cleanWordTimestamps";

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

  // Capture audio segments + clip metadata (for undo of extensions)
  let audio = null;
  let clipMeta = null;
  try {
    const editorStore = require("./useEditorStore").default;
    const es = editorStore.getState();
    if (es.audioSegments) {
      audio = es.audioSegments.map((s) => ({ ...s }));
    }
    // Capture clip extension metadata so undo can re-cut the video
    if (es.clip) {
      clipMeta = {
        startTime: es.clip.startTime,
        endTime: es.clip.endTime,
        duration: es.clip.duration,
        filePath: es.clip.filePath,
        sourceStartTime: es.sourceStartTime,
        sourceEndTime: es.sourceEndTime,
        maxExtendLeftSec: es.maxExtendLeftSec,
        maxExtendSec: es.maxExtendSec,
        videoVersion: es.videoVersion,
      };
    }
  } catch (_) {}

  return { sub, cap, layout, audio, clipMeta };
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
  // Restore audio segments + revert clip boundaries if extension was undone
  if (snapshot.audio || snapshot.clipMeta) {
    try {
      const editorStore = require("./useEditorStore").default;
      if (snapshot.audio) {
        editorStore.setState({ audioSegments: snapshot.audio });
      }
      // If clip boundaries changed (extension was done), re-cut the video
      if (snapshot.clipMeta) {
        const es = editorStore.getState();
        const currentStart = es.clip?.startTime;
        const currentEnd = es.clip?.endTime;
        const snapStart = snapshot.clipMeta.startTime;
        const snapEnd = snapshot.clipMeta.endTime;
        // Only re-cut if boundaries actually differ
        if (currentStart !== undefined && currentEnd !== undefined &&
            (Math.abs((currentStart || 0) - (snapStart || 0)) > 0.05 ||
             Math.abs((currentEnd || 0) - (snapEnd || 0)) > 0.05)) {
          console.log("[Undo] Clip boundaries changed — reverting. Current:", currentStart, "-", currentEnd, "Snapshot:", snapStart, "-", snapEnd);
          editorStore.getState().revertClipBoundaries(snapshot.clipMeta);
        }
      }
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

// ── Validate and clamp word timestamps to segment boundaries ──
// Per-clip transcription (WhisperX on short clip audio) produces accurate word
// timestamps. This function just ensures they stay within segment bounds.
function validateWords(words, segStart, segEnd) {
  if (!words || words.length === 0) return words;
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
  highlightMode: "instant", // "instant" (default) or "progressive" (gradient sweep)
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

  // ── Restore saved styling from clip.subtitleStyle (persisted by handleSave) ──
  // Called after applyTemplate() so saved customizations override template defaults.
  restoreSavedStyle: (saved) => {
    if (!saved || typeof saved !== "object") return;
    // Map saved subtitleStyle keys → store property names
    const mapping = {
      fontFamily: "subFontFamily", fontWeight: "subFontWeight",
      fontSize: "fontSize", bold: "subBold", italic: "subItalic",
      underline: "subUnderline", subColor: "subColor",
      strokeOn: "strokeOn", strokeWidth: "strokeWidth",
      strokeColor: "strokeColor", strokeOpacity: "strokeOpacity",
      strokeBlur: "strokeBlur", strokeOffsetX: "strokeOffsetX", strokeOffsetY: "strokeOffsetY",
      shadowOn: "shadowOn", shadowBlur: "shadowBlur",
      shadowColor: "shadowColor", shadowOpacity: "shadowOpacity",
      shadowOffsetX: "shadowOffsetX", shadowOffsetY: "shadowOffsetY",
      glowOn: "glowOn", glowColor: "glowColor", glowOpacity: "glowOpacity",
      glowIntensity: "glowIntensity", glowBlur: "glowBlur", glowBlend: "glowBlend",
      glowOffsetX: "glowOffsetX", glowOffsetY: "glowOffsetY",
      bgOn: "bgOn", bgOpacity: "bgOpacity", bgColor: "bgColor",
      bgPaddingX: "bgPaddingX", bgPaddingY: "bgPaddingY", bgRadius: "bgRadius",
      highlightColor: "highlightColor", segmentMode: "segmentMode",
      syncOffset: "syncOffset", subMode: "subMode",
      animateOn: "animateOn", animateScale: "animateScale",
      animateGrowFrom: "animateGrowFrom", animateSpeed: "animateSpeed",
    };
    const patch = {};
    for (const [savedKey, storeKey] of Object.entries(mapping)) {
      if (saved[savedKey] !== undefined) patch[storeKey] = saved[savedKey];
    }
    // Deep-copy objects
    if (patch.punctuationRemove) patch.punctuationRemove = { ...saved.punctuationRemove };
    if (Object.keys(patch).length > 0) set(patch);
  },

  // ── Full reset — clears all segments to prevent data leaking between clips ──
  clearAll: () => {
    set({
      editSegments: [],
      originalSegments: [],
      activeSegId: null,
      activeRow: 0,
      selectedWordInfo: null,
      editingWordKey: null,
      _undoStack: [],
      _redoStack: [],
      _lastUndoPushTime: 0,
    });
  },

  // ── Init from project data ──
  initSegments: (project, clip) => {
    if (!clip) {
      set({ editSegments: [], activeSegId: null });
      return;
    }

    // Priority: 1) clip.transcription (re-transcribed, IF still valid for current duration),
    //           2) clip.subtitles.sub1 (pipeline-generated or editor-saved, already clip-relative),
    //           3) project.transcription (source-level, needs offset)
    const hasClipTranscription = !!clip?.transcription?.segments?.length;
    const hasClipSubtitles = clip?.subtitles?.sub1?.length > 0;
    const hasProjectTranscription = !!project?.transcription?.segments?.length;

    // Detect stale transcription: if its time span significantly exceeds clip duration,
    // it was made before a trim and no longer matches the current video file
    let transcriptionIsStale = false;
    if (hasClipTranscription) {
      const segs = clip.transcription.segments;
      const lastEnd = Math.max(...segs.map(s => s.end || 0));
      const clipDur = clip.duration || 0;
      if (clipDur > 0 && lastEnd > clipDur * 1.5) {
        console.warn(`[initSegments] Stale transcription detected: spans ${lastEnd.toFixed(1)}s but clip is ${clipDur.toFixed(1)}s — skipping`);
        transcriptionIsStale = true;
      }
    }

    let segments;
    let clipStart = 0; // offset to subtract from timestamps

    if (hasClipTranscription && !transcriptionIsStale) {
      // Re-transcribed: already clip-relative (0-based)
      segments = clip.transcription.segments;
      clipStart = 0;
    } else if (hasClipSubtitles) {
      // Pipeline-generated or editor-saved subtitles: already clip-relative (0-based)
      segments = clip.subtitles.sub1;
      clipStart = 0;
    } else if (Array.isArray(clip?.subtitles) && clip.subtitles.length > 0) {
      // Legacy: editor saved as flat array before format fix
      segments = clip.subtitles;
      clipStart = 0;
    } else if (hasProjectTranscription) {
      // Source-level transcription: need to offset by clip.startTime
      segments = project.transcription.segments;
      clipStart = clip.startTime || 0;
    } else {
      set({ editSegments: [], activeSegId: null });
      return;
    }

    // Filter and clip-end bounds — always enforce upper bound for project transcription
    const clipDuration = clip.duration || (clip.endTime && clip.startTime ? clip.endTime - clip.startTime : 0);
    const clipEnd = clipStart > 0 ? (clip.endTime || Infinity) : (clipDuration > 0 ? clipDuration : Infinity);

    console.log(`[initSegments] source=${hasClipTranscription ? 'clip-transcription' : hasClipSubtitles ? 'clip-subtitles' : 'project-transcription'}, clipStart=${clipStart.toFixed(2)}, segments=${segments.length}`);

    // Filter out "mega-segments" — transcription artifacts where stable-ts/Whisper
    // outputs a single segment spanning the entire audio with all words crammed in,
    // alongside proper sentence-level segments. The mega-segment has compressed
    // word timestamps that cause ghost subtitles racing ahead during pauses.
    const clipDur = clip.endTime && clip.startTime ? (clip.endTime - clip.startTime) : (clip.duration || 0);
    const filteredSegments = segments.length > 1
      ? segments.filter((s) => {
          const segDur = (s.end || 0) - (s.start || 0);
          const wordCount = s.words?.length || 0;
          const isMega = segDur > 0 && clipDur > 0 && segDur > clipDur * 0.85 && wordCount > 20;
          if (isMega) {
            console.warn(`[initSegments] Filtering mega-segment: ${segDur.toFixed(1)}s, ${wordCount} words (clip ${clipDur.toFixed(1)}s)`);
          }
          return !isMega;
        })
      : segments;

    // Remove overlapping duplicate segments — whisperx sometimes emits two segments
    // covering the same time range with the same words
    const stripPunct = (t) => (t || "").toLowerCase().replace(/[.,!?;:'"]+/g, "").trim();
    const deduped = [];
    for (const s of filteredSegments) {
      const overlap = deduped.find(
        (d) => Math.abs(d.start - s.start) < 0.3 && Math.abs(d.end - s.end) < 0.3
      );
      if (!overlap) deduped.push(s);
    }
    if (deduped.length < filteredSegments.length) {
      console.log(`[initSegments] Removed ${filteredSegments.length - deduped.length} duplicate overlapping segments`);
    }

    // Remove consecutive duplicate words within segments — whisperx sometimes
    // outputs the same word twice with slightly different timestamps (e.g. "friendly," then "friendly")
    for (const s of deduped) {
      if (!s.words || s.words.length < 2) continue;
      const cleaned = [s.words[0]];
      for (let i = 1; i < s.words.length; i++) {
        const prev = s.words[i - 1];
        const curr = s.words[i];
        if (stripPunct(curr.word) === stripPunct(prev.word) && Math.abs(curr.start - prev.end) < 0.5) {
          // Keep the first occurrence but extend its end time
          cleaned[cleaned.length - 1] = { ...cleaned[cleaned.length - 1], end: curr.end };
        } else {
          cleaned.push(curr);
        }
      }
      if (cleaned.length < s.words.length) {
        console.log(`[initSegments] Deduped ${s.words.length - cleaned.length} consecutive duplicate words in segment "${s.text?.slice(0, 30)}"`);
        s.words = cleaned;
        s.text = cleaned.map(w => w.word).join(" ");
      }
    }

    const segs = deduped
      .filter((s) => {
        if (clipEnd === Infinity) return true;
        return s.start < clipEnd && s.end > clipStart;
      })
      .map((s, i) => {
        const segStartSec = Math.max(0, s.start - clipStart);
        const segEndSec = Math.max(0, s.end - clipStart);

        // Build words, then filter out words that were entirely before clip start
        // (they got clamped to 0 and would cause duplicate phrases at the beginning)
        const allWords = (s.words || []).map(w => ({
          word: w.word,
          start: Math.max(0, (w.start ?? s.start) - clipStart),
          end: Math.max(0, (w.end ?? s.end) - clipStart),
          probability: w.probability ?? 1,
          _originalStart: w.start ?? s.start, // keep original for filtering
        }));

        // Drop words whose original time was entirely before clip start
        // (these are words from a segment that straddled the clip boundary)
        const clippedWords = clipStart > 0
          ? allWords.filter(w => w._originalStart >= clipStart - 0.05)
          : allWords;

        // Clean up internal field
        const cleanWords = clippedWords.map(({ _originalStart, ...w }) => w);

        const rawWords = mergeWordTokens(cleanWords, s.text);
        const validatedWords = validateWords(rawWords, segStartSec, segEndSec);
        const repairedWords = cleanWordTimestamps(validatedWords, {
          segStart: segStartSec,
          segEnd: segEndSec,
        });

        if (i === 0) {
          console.log(`[initSegments] First seg: [${segStartSec.toFixed(2)}-${segEndSec.toFixed(2)}], text="${s.text.slice(0, 40)}"`);
          if (repairedWords.length > 0) {
            console.log(`[initSegments] First word: "${repairedWords[0].word}" at ${repairedWords[0].start.toFixed(3)}-${repairedWords[0].end.toFixed(3)}`);
          }
        }

        // Rebuild segment text from surviving words (boundary trim may have removed some)
        const segText = repairedWords.length > 0
          ? repairedWords.map(w => w.word).join("").trim()
          : s.text;

        return {
          id: i + 1,
          start: fmtTime(segStartSec),
          end: fmtTime(segEndSec),
          dur: ((s.end - s.start).toFixed(1)) + "s",
          text: segText || s.text,
          track: "s1",
          conf: "high",
          startSec: segStartSec,
          endSec: segEndSec,
          warning: (s.end - s.start) > 10 ? "Long segment — consider splitting" : null,
          words: repairedWords,
        };
      })
      .filter((s) => s.words.length > 0 || s.text.trim().length > 0); // Drop empty segments from boundary trim
    // Re-number IDs after filtering
    segs.forEach((s, i) => { s.id = i + 1; });
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
  _dragging: false,
  startDrag: () => {
    // Capture pre-drag state as single undo entry, then lock further pushes until drag ends
    get()._pushUndo();
    set({ _dragging: true });
  },
  endDrag: () => set({ _dragging: false }),
  _pushUndo: () => {
    // No-op during drag/resize — pre-drag snapshot already captured by startDrag()
    if (get()._dragging) return;
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
    const { editSegments, segmentMode } = get();
    const seg = editSegments.find(s => s.id === segId);
    if (!seg) return;

    // Detect multi-word input (e.g., user typed "way I just" to replace "way")
    const inputWords = newText.split(/\s+/).filter(Boolean);

    // In 1-word mode, auto-split multi-word input into separate segments
    if (segmentMode === "1word" && inputWords.length > 1) {
      // This segment should become multiple segments
      const segDur = seg.endSec - seg.startSec;
      const perWord = segDur / inputWords.length;
      const newSegs = inputWords.map((word, i) => ({
        ...seg,
        id: i === 0 ? seg.id : Date.now() + i,
        text: word,
        startSec: seg.startSec + i * perWord,
        endSec: seg.startSec + (i + 1) * perWord,
        start: fmtTime(seg.startSec + i * perWord),
        end: fmtTime(seg.startSec + (i + 1) * perWord),
        dur: perWord.toFixed(1) + "s",
        words: [{
          word,
          start: seg.startSec + i * perWord,
          end: seg.startSec + (i + 1) * perWord,
          probability: 1,
        }],
      }));
      const idx = editSegments.findIndex(s => s.id === segId);
      const next = [...editSegments];
      next.splice(idx, 1, ...newSegs);
      set({ editSegments: next, activeSegId: newSegs[0].id });
      return;
    }

    // Standard single-word update
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
      editSegments: s.editSegments.map(seg => {
        if (seg.id !== segId) return seg;

        // Sync word-level timestamps with new segment boundaries
        let updatedWords = seg.words || [];
        if (updatedWords.length > 0) {
          const oldStart = seg.startSec;
          const oldEnd = seg.endSec;
          const oldDur = oldEnd - oldStart;
          const newDur = endSec - startSec;
          const delta = startSec - oldStart;
          const durChanged = Math.abs(newDur - oldDur) > 0.001;
          const startChanged = Math.abs(delta) > 0.001;

          if (durChanged) {
            // Trim operation — duration changed, one edge moved
            // Filter out words fully outside new boundaries, clamp the rest
            updatedWords = updatedWords
              .filter(w => {
                // Keep word if any part falls within the new boundaries
                return w.end > startSec && w.start < endSec;
              })
              .map(w => ({
                ...w,
                start: Math.max(w.start, startSec),
                end: Math.min(w.end, endSec),
              }));
          } else if (startChanged) {
            // Move operation — same duration, both edges shifted by delta
            updatedWords = updatedWords.map(w => ({
              ...w,
              start: w.start + delta,
              end: w.end + delta,
            }));
          }
        }

        return {
          ...seg,
          startSec,
          endSec,
          start: fmtTime(startSec),
          end: fmtTime(endSec),
          dur: (endSec - startSec).toFixed(1) + "s",
          words: updatedWords,
        };
      }),
    }));
  },

  // Add a new segment at a specific time range (used by drag-split)
  addSegmentAt: (startSec, endSec, text) => {
    get()._pushUndo();
    const newSeg = {
      id: "seg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      startSec,
      endSec,
      start: fmtTime(startSec),
      end: fmtTime(endSec),
      dur: (endSec - startSec).toFixed(1) + "s",
      text: text || "",
      words: [],
    };
    set((s) => ({
      editSegments: [...s.editSegments, newSeg].sort((a, b) => a.startSec - b.startSec),
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

  // ── Create a new blank subtitle segment at a given time ──
  createSegmentAtTime: (atTime) => {
    get()._pushUndo();
    const { editSegments } = get();
    const DEFAULT_DUR = 0.5; // seconds
    let startSec = atTime;
    let endSec = atTime + DEFAULT_DUR;

    // Find where this segment fits — don't overlap existing segments
    const sorted = [...editSegments].sort((a, b) => a.startSec - b.startSec);

    // Find the gap we're inserting into
    for (let i = 0; i < sorted.length; i++) {
      const seg = sorted[i];
      // If atTime falls inside an existing segment, place after it
      if (atTime >= seg.startSec && atTime < seg.endSec) {
        startSec = seg.endSec;
        endSec = seg.endSec + DEFAULT_DUR;
        break;
      }
    }

    // Clamp endSec to not overlap the next segment
    const nextSeg = sorted.find(s => s.startSec > startSec);
    if (nextSeg && endSec > nextSeg.startSec) {
      endSec = nextSeg.startSec;
    }

    // Ensure minimum duration
    if (endSec - startSec < 0.05) endSec = startSec + 0.1;

    const newId = Date.now();
    const newSeg = {
      id: newId,
      start: fmtTime(startSec),
      end: fmtTime(endSec),
      dur: (endSec - startSec).toFixed(1) + "s",
      text: "",
      track: "s1",
      conf: "high",
      startSec,
      endSec,
      warning: null,
      words: [],
    };

    // Insert in sorted position
    const next = [...editSegments, newSeg].sort((a, b) => a.startSec - b.startSec);
    set({ editSegments: next, activeSegId: newId });
    return newId;
  },

  deleteSegment: (segId) => {
    get()._pushUndo();
    set((s) => ({ editSegments: s.editSegments.filter(seg => seg.id !== segId) }));
  },

  rippleDeleteSegment: (segId) => {
    get()._pushUndo();
    const { editSegments } = get();
    const seg = editSegments.find(s => s.id === segId);
    if (!seg) return;
    const gap = seg.endSec - seg.startSec;
    const next = editSegments
      .filter(s => s.id !== segId)
      .map(s => {
        if (s.startSec >= seg.endSec) {
          const newStart = s.startSec - gap;
          const newEnd = s.endSec - gap;
          return { ...s, startSec: newStart, endSec: newEnd, start: fmtTime(newStart), end: fmtTime(newEnd) };
        }
        return s;
      });
    set({ editSegments: next });
  },

  // ── Styling setters (all push undo for Ctrl+Z support) ──
  _pushStyleUndo: () => { get()._pushUndo(); },
  setSubMode: (m) => { get()._pushStyleUndo(); set({ subMode: m }); },
  setHighlightMode: (m) => { get()._pushStyleUndo(); set({ highlightMode: m }); },
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
    const { originalSegments, editSegments } = get();
    if (!originalSegments || originalSegments.length === 0) {
      set({ segmentMode: mode });
      return;
    }

    // Identify manually-created segments (user-added, not from transcription).
    // A segment is "manual" if it doesn't overlap with ANY original segment's time range.
    // Also preserve segments whose text was user-edited (text differs from original words).
    const manualSegs = editSegments.filter((es) => {
      const overlapsOriginal = originalSegments.some((os) =>
        es.startSec < os.endSec && es.endSec > os.startSec
      );
      return !overlapsOriginal;
    });

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

    // Deduplicate overlapping words — whisperx can output overlapping segments
    // that contain the same words, causing duplicate subtitle chunks
    const stripP = (t) => (t || "").toLowerCase().replace(/[.,!?;:'"]+/g, "").trim();
    const dedupedWords = [];
    for (const w of allWords) {
      const isDup = dedupedWords.some(
        (d) => Math.abs(d.start - w.start) < 0.5 && stripP(d.word) === stripP(w.word)
      );
      if (!isDup) dedupedWords.push(w);
    }
    if (dedupedWords.length < allWords.length) {
      console.log(`[setSegmentMode] Deduped ${allWords.length - dedupedWords.length} overlapping words`);
    }

    // ── Clean word timestamps before segmentation ──
    const cleanedWords = cleanWordTimestamps(dedupedWords);

    // ── Delegate to pure segmentation function (spec v1.1) ──
    const rawSegs = segmentWords(cleanedWords, mode).map((seg, i) => ({
      id: Date.now() + i,
      start: fmtTime(seg.startSec),
      end: fmtTime(seg.endSec),
      dur: (seg.endSec - seg.startSec).toFixed(1) + "s",
      text: seg.text,
      track: seg.track || "s1",
      conf: seg.conf || "high",
      startSec: seg.startSec,
      endSec: seg.endSec,
      warning: seg.warning || null,
      words: seg.words,
    }));

    // Merge manually-created segments back in, sorted by time
    const merged = [...rawSegs, ...manualSegs].sort((a, b) => a.startSec - b.startSec);

    set({ editSegments: merged, segmentMode: mode, activeSegId: merged[0]?.id });
  },
}));

export default useSubtitleStore;
