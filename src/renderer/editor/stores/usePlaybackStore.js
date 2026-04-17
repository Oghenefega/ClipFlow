import { create } from "zustand";
import {
  sourceToTimeline,
  timelineToSource,
  getTimelineDuration,
} from "../models/timeMapping";

// ── Derived-state helpers ──
// Forward-scan-from-last-index gives O(1) amortized lookup during playback
// (time only advances, so the active seg/word is usually the current one or
// the next one). On a big seek we fall back to a linear scan from 0 — still
// fast enough for a one-time cost per seek, and segment counts are bounded.
//
// Cache keyed by array identity so a fresh originalSegments reference rebuilds
// the flat word list (subtitle-store returns new arrays on edit).
let _wordCache = { segsRef: null, words: [] };

function _buildFlatWordStarts(origSegs) {
  if (_wordCache.segsRef === origSegs) return _wordCache.words;
  const words = [];
  for (const seg of origSegs) {
    if (seg.words && seg.words.length > 0) {
      for (const w of seg.words) words.push(w.start);
    } else if (seg.text) {
      const textWords = seg.text.split(/\s+/).filter(Boolean);
      const dur = (seg.endSec ?? seg.end ?? 0) - (seg.startSec ?? seg.start ?? 0);
      const perWord = dur / Math.max(1, textWords.length);
      const base = seg.startSec ?? seg.start ?? 0;
      for (let i = 0; i < textWords.length; i++) words.push(base + i * perWord);
    }
  }
  _wordCache = { segsRef: origSegs, words };
  return words;
}

// Find active word index (last word whose start ≤ adjustedTime).
// Forward-scans from lastIdx; falls back to scan-from-0 on big seek.
function _findActiveWordIdx(origSegs, adjustedTime, lastIdx) {
  const starts = _buildFlatWordStarts(origSegs);
  if (starts.length === 0) return -1;

  let i = Math.max(0, Math.min(lastIdx >= 0 ? lastIdx : 0, starts.length - 1));

  // If current is valid and time advanced, forward-scan
  if (adjustedTime >= starts[i]) {
    while (i + 1 < starts.length && adjustedTime >= starts[i + 1]) i++;
    return i;
  }
  // Time went backward or starts out ahead — rescan from 0
  if (adjustedTime < starts[0]) return -1;
  for (let j = 0; j < starts.length; j++) {
    if (starts[j] > adjustedTime) return j - 1;
  }
  return starts.length - 1;
}

// Find active subtitle segment id (seg whose [startSec, endSec] contains adjustedTime).
// Segments are ordered by startSec. In-gap returns null.
function _findActiveSubSegId(editSegs, adjustedTime, lastIdx) {
  if (!editSegs || editSegs.length === 0) return null;

  let i = Math.max(0, Math.min(lastIdx >= 0 ? lastIdx : 0, editSegs.length - 1));

  // Forward-scan from lastIdx
  if (adjustedTime >= editSegs[i].startSec) {
    while (i + 1 < editSegs.length && adjustedTime >= editSegs[i + 1].startSec) i++;
    if (adjustedTime <= editSegs[i].endSec) return editSegs[i].id;
    return null; // past this seg, before next (gap)
  }
  // Backward / big-jump: linear scan
  for (let j = 0; j < editSegs.length; j++) {
    if (adjustedTime < editSegs[j].startSec) return null;
    if (adjustedTime <= editSegs[j].endSec) return editSegs[j].id;
  }
  return null;
}

// Scan-index caches (non-reactive, module-level — forward-scan correctness
// doesn't require them to be in store state).
let _lastWordIdx = -1;
let _lastSubSegIdx = -1;

const usePlaybackStore = create((set, get) => ({
  playing: false,
  currentTime: 0, // TIMELINE time (derived from source time via segment mapping)
  duration: 0,
  tlSpeed: "1x",
  tlScrubbing: false,
  trimIn: 0,
  trimOut: null, // null = full clip duration

  // ── Derived from currentTime inside setCurrentTime. Subscribers to these
  // re-render only when the discrete value changes (word-rate / seg-rate /
  // 10Hz) instead of every 60fps tick. See #57 Phase B.
  activeSubtitleSegId: null,
  activeTranscriptWordIdx: -1,
  displayTime: 0, // 100ms-quantized currentTime for low-frequency UI

  // NLE segment list — set by editor store whenever segments change
  nleSegments: [],

  // Video element plays the pre-cut clip file. Its local currentTime is
  // clip-relative (0 = clip.startTime). Segments are source-absolute.
  // absolute = vidTime + clipFileOffset;  vidTime = absolute - clipFileOffset
  clipFileOffset: 0,

  // True duration of the clip file on disk (set once from video.duration on
  // loadedmetadata). Distinct from `duration` above, which is timeline duration
  // and shrinks on trim. Used by waveform peak slicing, which needs the
  // unchanging clip-file extent as denominator.
  clipFileDuration: 0,

  // videoRef is stored here as a plain object property (not reactive)
  // Set it once via initVideoRef() from PreviewPanel
  _videoRef: null,

  // ── Actions ──
  initVideoRef: (ref) => { get()._videoRef = ref; },
  getVideoRef: () => get()._videoRef,

  setPlaying: (v) => set({ playing: v }),
  togglePlay: () => {
    const { playing, currentTime, duration, seekTo } = get();
    if (!playing && duration > 0 && currentTime >= duration - 0.1) {
      seekTo(0);
    }
    set({ playing: !playing });
  },

  setCurrentTime: (t) => {
    const state = get();
    const patch = { currentTime: t };

    // ── Derive discrete indices (subscribers skip re-render via === equality
    // on values that haven't changed this frame).
    let subSegs = null;
    let origSegs = null;
    let syncOffset = 0;
    try {
      // Lazy require to avoid circular dep — subtitle store imports from
      // models; playback doesn't depend on subtitle at module init time.
      const subState = require("./useSubtitleStore").default.getState();
      subSegs = subState.editSegments;
      origSegs = subState.originalSegments;
      syncOffset = subState.syncOffset || 0;
    } catch (_) { /* subtitle store not ready — skip derivation */ }

    const adjusted = t - syncOffset;

    if (subSegs) {
      const newSegId = _findActiveSubSegId(subSegs, adjusted, _lastSubSegIdx);
      // Update cache index by scanning once more to capture the index position
      // (cheap since forward-scan already advanced). We keep the module-level
      // cache simple: just update when the id changes.
      if (newSegId !== state.activeSubtitleSegId) {
        patch.activeSubtitleSegId = newSegId;
        // Re-locate the index for future forward-scan
        if (newSegId) {
          _lastSubSegIdx = subSegs.findIndex(s => s.id === newSegId);
        }
      }
    }

    if (origSegs) {
      const newWordIdx = _findActiveWordIdx(origSegs, adjusted, _lastWordIdx);
      if (newWordIdx !== state.activeTranscriptWordIdx) {
        patch.activeTranscriptWordIdx = newWordIdx;
        _lastWordIdx = newWordIdx;
      }
    }

    // 100ms-quantized displayTime — changes 10×/sec instead of 60×/sec
    const newDisplayTime = Math.floor(t * 10) / 10;
    if (newDisplayTime !== state.displayTime) {
      patch.displayTime = newDisplayTime;
    }

    set(patch);
  },
  setDuration: (d) => set({ duration: d }),

  /**
   * Set the NLE segment list and update duration.
   * Called by editor store whenever nleSegments changes.
   */
  setNleSegments: (segments) => {
    const duration = getTimelineDuration(segments);
    set({ nleSegments: segments, duration });

    // If video's current source position is outside all new segments, snap it
    // into the first segment. Video currentTime is CLIP-RELATIVE; segments are
    // SOURCE-ABSOLUTE — translate via clipFileOffset.
    const { clipFileOffset } = get();
    const ref = get()._videoRef;
    const vid = ref?.current;
    if (vid && segments.length > 0) {
      const srcAbs = vid.currentTime + clipFileOffset;
      // Use epsilon-tolerant check so sub-millisecond FP drift at the segment
      // start doesn't falsely mark the video as "outside" the segment.
      const EPS = 0.001;
      const inside = segments.some((s) => srcAbs >= s.sourceStart - EPS && srcAbs <= s.sourceEnd + EPS);
      if (!inside) {
        const targetAbs = segments[0].sourceStart;
        vid.currentTime = Math.max(0, targetAbs - clipFileOffset);
        // Snap store currentTime to the timeline position we just seeked to
        // (start of first segment = timeline 0). Previously we hardcoded 0
        // which was correct numerically but brittle.
        set({ currentTime: 0 });
      } else {
        const mapped = sourceToTimeline(srcAbs, segments);
        if (mapped.found) set({ currentTime: mapped.timelineTime });
      }
    }
  },

  /**
   * Seek to a timeline position. Converts to source time and sets video.currentTime.
   */
  seekTo: (timelineSec) => {
    const { nleSegments, clipFileOffset } = get();
    let targetSourceAbs = timelineSec;

    if (nleSegments.length > 0) {
      const clamped = Math.max(0, Math.min(timelineSec, getTimelineDuration(nleSegments)));
      const mapped = timelineToSource(clamped, nleSegments);
      if (mapped.found) {
        targetSourceAbs = mapped.sourceTime;
      } else {
        const last = nleSegments[nleSegments.length - 1];
        targetSourceAbs = last.sourceEnd;
      }
      // Route through setCurrentTime so derived indices stay in sync on seek.
      get().setCurrentTime(clamped);
    } else {
      get().setCurrentTime(timelineSec);
    }

    const ref = get()._videoRef;
    if (ref?.current) {
      const writeVal = Math.max(0, targetSourceAbs - clipFileOffset);
      ref.current.currentTime = writeVal;
    }
  },

  /**
   * Called from the rAF loop / onTimeUpdate with the video element's source time.
   * Converts to timeline time and handles gap-crossing between segments.
   *
   * Returns { timelineTime, needsSeek, seekToSource } so the caller
   * can perform the seek on the video element.
   */
  mapSourceTime: (vidTime) => {
    const { nleSegments, clipFileOffset } = get();
    if (nleSegments.length === 0) {
      return { timelineTime: vidTime, needsSeek: false, seekToSource: 0 };
    }

    // Incoming vidTime is CLIP-RELATIVE (video element). Segments are SOURCE-ABSOLUTE.
    const sourceAbs = vidTime + clipFileOffset;
    // Helper: convert source-absolute target back to clip-relative for video.currentTime
    const toVid = (abs) => Math.max(0, abs - clipFileOffset);

    const mapped = sourceToTimeline(sourceAbs, nleSegments);
    if (mapped.found) {
      const seg = nleSegments[mapped.segmentIndex];
      if (sourceAbs >= seg.sourceEnd - 0.02) {
        const nextIdx = mapped.segmentIndex + 1;
        if (nextIdx < nleSegments.length) {
          return {
            timelineTime: mapped.timelineTime,
            needsSeek: true,
            seekToSource: toVid(nleSegments[nextIdx].sourceStart),
          };
        } else {
          return {
            timelineTime: getTimelineDuration(nleSegments),
            needsSeek: false,
            seekToSource: 0,
            atEnd: true,
          };
        }
      }
      return { timelineTime: mapped.timelineTime, needsSeek: false, seekToSource: 0 };
    }

    // Source time is in a gap — find next segment
    for (let i = 0; i < nleSegments.length; i++) {
      if (nleSegments[i].sourceStart > sourceAbs) {
        return {
          timelineTime: get().currentTime,
          needsSeek: true,
          seekToSource: toVid(nleSegments[i].sourceStart),
        };
      }
    }

    return {
      timelineTime: getTimelineDuration(nleSegments),
      needsSeek: false,
      seekToSource: 0,
      atEnd: true,
    };
  },

  setTlSpeed: (speed) => set({ tlSpeed: speed }),
  setTlScrubbing: (v) => set({ tlScrubbing: v }),
  setTrimIn: (t) => set({ trimIn: t }),
  setTrimOut: (t) => set({ trimOut: t }),

  reset: () => {
    _lastWordIdx = -1;
    _lastSubSegIdx = -1;
    _wordCache = { segsRef: null, words: [] };
    set({
      playing: false,
      currentTime: 0,
      duration: 0,
      tlScrubbing: false,
      trimIn: 0,
      trimOut: null,
      nleSegments: [],
      activeSubtitleSegId: null,
      activeTranscriptWordIdx: -1,
      displayTime: 0,
    });
  },
}));

export default usePlaybackStore;
