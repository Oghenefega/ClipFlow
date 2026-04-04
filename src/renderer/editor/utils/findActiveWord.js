/**
 * Shared findActiveWord — Unified word-driven highlight lookup
 *
 * Used by BOTH:
 *   - PreviewOverlays.js (React, ES module import)
 *   - overlay-renderer.js (offscreen BrowserWindow, require())
 *
 * Plain JavaScript only. No JSX, no React imports, no ES-only syntax.
 * Uses CJS module.exports for dual compatibility (CRA webpack handles it as named imports).
 *
 * See: tasks/subtitle-timing-rebuild-spec-v2.md — Phase 3
 */

// ── Constants ──

var TAIL_HOLD_DURATION = 1.5;   // seconds — keep last word visible to prevent blank flashes
var PRE_WORD_LOOKAHEAD = 0.15;  // seconds — show first word slightly early for "on time" perception

// ── Build flat word index for word-driven timing ──
// Word-driven approach: find the active WORD first across ALL segments,
// then display its containing segment. This ensures words appear exactly
// when spoken, not delayed by segment boundaries.

function buildGlobalWordIndex(segments) {
  var index = [];
  for (var si = 0; si < segments.length; si++) {
    var seg = segments[si];
    if (seg.words && seg.words.length > 0) {
      for (var wi = 0; wi < seg.words.length; wi++) {
        index.push({ segIdx: si, wordIdx: wi, word: seg.words[wi] });
      }
    }
  }
  return index;
}

// ── Find active segment + word + progress at a given time ──
//
// Returns:
//   seg          — the active segment object, or null
//   wordIdx      — index of the active word within seg.words, or -1
//   wordProgress — 0-1 progress within the active word (for progressive fill)

function findActiveWord(segments, globalWordIndex, time) {
  if (!segments || segments.length === 0) {
    return { seg: null, wordIdx: -1, wordProgress: 0 };
  }

  if (globalWordIndex.length > 0) {
    // Find the most recent word that has started, with advance buffer.
    // For word[0], advance at word.start (no delay — first word should feel instant).
    // For word[i>0], advance at word.start + ADVANCE_BUFFER to prevent premature
    // jumps when Whisper sets word.start slightly before actual speech onset.
    var bestGlobal = -1;
    for (var i = 0; i < globalWordIndex.length; i++) {
      if (time >= globalWordIndex[i].word.start) bestGlobal = i;
      else break; // sorted by time, can early-exit
    }

    if (bestGlobal >= 0) {
      var entry = globalWordIndex[bestGlobal];
      var seg = segments[entry.segIdx];
      var word = entry.word;

      // Must be within segment boundaries AND within tail hold period
      if (time >= seg.startSec && time < seg.endSec &&
          time <= word.end + TAIL_HOLD_DURATION) {
        // Calculate progress within this word (0 = just started, 1 = fully spoken)
        var wordDuration = word.end - word.start;
        var wordProgress = wordDuration > 0
          ? Math.min(1, Math.max(0, (time - word.start) / wordDuration))
          : 1; // zero-duration word = instantly complete

        return { seg: seg, wordIdx: entry.wordIdx, wordProgress: wordProgress };
      }
    }

    // Before any word: check if we're close to the first word (lookahead)
    if (bestGlobal < 0 && globalWordIndex.length > 0) {
      var firstEntry = globalWordIndex[0];
      var firstSeg = segments[firstEntry.segIdx];
      if (time >= firstEntry.word.start - PRE_WORD_LOOKAHEAD &&
          time >= firstSeg.startSec && time < firstSeg.endSec) {
        return { seg: firstSeg, wordIdx: firstEntry.wordIdx, wordProgress: 0 };
      }
    }
  }

  // Fallback: segment without word data — use segment boundaries
  var fallbackSeg = null;
  for (var s = 0; s < segments.length; s++) {
    if (time >= segments[s].startSec && time < segments[s].endSec) {
      fallbackSeg = segments[s];
      break;
    }
  }
  return { seg: fallbackSeg, wordIdx: -1, wordProgress: 0 };
}

// ── CJS exports (dual-compatible with CRA webpack + Node require) ──

module.exports = {
  findActiveWord: findActiveWord,
  buildGlobalWordIndex: buildGlobalWordIndex,
  TAIL_HOLD_DURATION: TAIL_HOLD_DURATION,
  PRE_WORD_LOOKAHEAD: PRE_WORD_LOOKAHEAD,
};
