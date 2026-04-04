/**
 * Word Timestamp Post-Processing — Pure Function
 *
 * 4-pass pipeline that corrects Whisper's raw word timestamps before
 * segmentation. Whisper's DTW-based word alignment produces near-zero
 * durations, overestimated gaps, monotonicity violations, and cumulative
 * drift. Every professional subtitle tool post-processes these — we do too.
 *
 * Pass 1: Enforce monotonicity (midpoint averaging)
 * Pass 2: Enforce minimum word duration (50ms)
 * Pass 3: Fill micro-gaps between consecutive words (<150ms)
 * Pass 4: Detect suspicious timestamps & redistribute by character count
 *
 * No side effects. No store dependencies. Fully idempotent.
 * All word objects are new (spread) — input is never mutated.
 *
 * Sources: whisper-timestamped, stable-ts, CrisperWhisper, Aegisub
 * See: tasks/subtitle-timing-rebuild-spec-v2.md
 */

// ── Constants ──

const MIN_WORD_DURATION = 0.05;       // 50ms — CrisperWhisper threshold
const MICRO_GAP_THRESHOLD = 0.15;     // 150ms — stable-ts default
const MIN_CHAR_WEIGHT = 3;            // Minimum character weight for redistribution
const SUSPICIOUS_SHORT_COUNT = 3;     // 3+ words under 50ms = suspicious
const SUSPICIOUS_COVERAGE_RATIO = 0.6; // Words covering <60% of segment = suspicious
const SUSPICIOUS_IDENTICAL_PAIRS = 2;  // 2+ identical-duration pairs = suspicious
const IDENTICAL_DURATION_TOLERANCE = 0.005; // 5ms tolerance for "identical"

// ── Pass 1: Enforce Monotonicity ──
// From whisper-timestamped ensure_increasing_positions()
// If word[i].start < word[i-1].end, average to midpoint.

function enforceMonotonicity(words) {
  if (words.length < 2) return words;

  const result = words.map(w => ({ ...w }));

  for (let i = 1; i < result.length; i++) {
    if (result[i].start < result[i - 1].end) {
      let midpoint = (result[i - 1].end + result[i].start) / 2;

      // Guard: don't shrink previous word below MIN_WORD_DURATION
      if (midpoint - result[i - 1].start < MIN_WORD_DURATION) {
        midpoint = result[i - 1].start + MIN_WORD_DURATION;
      }

      result[i - 1] = { ...result[i - 1], end: midpoint };
      result[i] = { ...result[i], start: midpoint };
    }
  }

  return result;
}

// ── Pass 2: Enforce Minimum Word Duration ──
// Words shorter than 50ms get extended. Whisper gives short function words
// ("I", "a", "the") near-zero durations because attention can't distinguish.

function enforceMinDuration(words) {
  if (words.length === 0) return words;

  const result = words.map(w => ({ ...w }));

  for (let i = 0; i < result.length; i++) {
    const duration = result[i].end - result[i].start;
    if (duration < MIN_WORD_DURATION) {
      let newEnd = result[i].start + MIN_WORD_DURATION;

      // Don't extend past next word's start
      if (i + 1 < result.length) {
        newEnd = Math.min(newEnd, result[i + 1].start);
      }

      result[i] = { ...result[i], end: newEnd };
    }
  }

  return result;
}

// ── Pass 3: Fill Micro-Gaps ──
// From stable-ts merge_gap approach. Gaps <150ms between consecutive words
// in continuous speech are Whisper artifacts — fill by extending prior word.

function fillMicroGaps(words) {
  if (words.length < 2) return words;

  const result = words.map(w => ({ ...w }));

  for (let i = 0; i < result.length - 1; i++) {
    const gap = result[i + 1].start - result[i].end;
    if (gap > 0 && gap <= MICRO_GAP_THRESHOLD) {
      result[i] = { ...result[i], end: result[i + 1].start };
    }
  }

  return result;
}

// ── Pass 4: Suspicious Timestamp Detection & Redistribution ──
// The core drift fix. When word timestamps look unreliable, redistribute
// proportionally by character count within segment boundaries.

function isTimingSuspicious(words, segStart, segEnd) {
  if (words.length < 2) return false;

  const segDuration = segEnd - segStart;

  // Heuristic 1: Multiple short words (3+ words under 50ms)
  const shortCount = words.filter(w => (w.end - w.start) < MIN_WORD_DURATION).length;
  if (shortCount >= SUSPICIOUS_SHORT_COUNT) return true;

  // Heuristic 2: Words only cover <60% of segment duration
  if (segDuration > 0.2) {
    const totalWordDuration = words.reduce((sum, w) => sum + (w.end - w.start), 0);
    if (totalWordDuration / segDuration < SUSPICIOUS_COVERAGE_RATIO) return true;
  }

  // Heuristic 3: Adjacent words with identical durations (±5ms)
  let identicalPairs = 0;
  for (let i = 0; i < words.length - 1; i++) {
    const d1 = words[i].end - words[i].start;
    const d2 = words[i + 1].end - words[i + 1].start;
    if (Math.abs(d1 - d2) < IDENTICAL_DURATION_TOLERANCE) identicalPairs++;
  }
  if (identicalPairs >= SUSPICIOUS_IDENTICAL_PAIRS) return true;

  // Heuristic 4: Remaining monotonicity violations (safety net)
  for (let i = 1; i < words.length; i++) {
    if (words[i].start < words[i - 1].end - 0.001) return true;
  }

  return false;
}

function redistributeByCharCount(words, segStart, segEnd) {
  if (words.length === 0) return words;

  // Use word boundaries as speech region (not full segment, which may include linger)
  const speechStart = Math.max(segStart, words[0].start);
  const speechEnd = Math.min(segEnd, words[words.length - 1].end);
  const speechDuration = speechEnd - speechStart;

  if (speechDuration <= 0) return words; // degenerate case

  // Calculate total weighted character count
  const charWeights = words.map(w => {
    const clean = (w.word || "").replace(/[^a-zA-Z0-9']/g, "");
    return Math.max(clean.length, MIN_CHAR_WEIGHT);
  });
  const totalChars = charWeights.reduce((sum, c) => sum + c, 0);

  if (totalChars === 0) return words; // no real text

  // Redistribute
  let cursor = speechStart;
  return words.map((w, i) => {
    const wordDuration = speechDuration * (charWeights[i] / totalChars);
    const newStart = cursor;
    const newEnd = cursor + wordDuration;
    cursor = newEnd;
    return { ...w, start: newStart, end: newEnd };
  });
}

function detectAndRedistribute(words, segStart, segEnd) {
  // Skip if no segment anchors provided (cross-segment pass)
  if (segStart == null || segEnd == null) return words;

  // Skip single-word segments (nothing to redistribute)
  if (words.length < 2) return words;

  if (isTimingSuspicious(words, segStart, segEnd)) {
    return redistributeByCharCount(words, segStart, segEnd);
  }

  return words;
}

// ── Main Entry Point ──

/**
 * Clean raw Whisper word timestamps via 4-pass pipeline.
 *
 * @param {Array<{word: string, start: number, end: number, probability?: number, track?: string}>} words
 * @param {object} [options]
 * @param {number} [options.segStart] — segment start time (anchor for redistribution)
 * @param {number} [options.segEnd] — segment end time (anchor for redistribution)
 * @returns {Array<{word: string, start: number, end: number, probability?: number, track?: string}>}
 */
export function cleanWordTimestamps(words, options = {}) {
  if (!words || words.length === 0) return [];

  const { segStart, segEnd } = options;

  // Pass 1: Enforce monotonicity
  let result = enforceMonotonicity(words);

  // Pass 2: Enforce minimum word duration
  result = enforceMinDuration(result);

  // Pass 3: Fill micro-gaps
  result = fillMicroGaps(result);

  // Pass 4: Detect suspicious timestamps & redistribute
  result = detectAndRedistribute(result, segStart, segEnd);

  return result;
}

// Export internals for testing
export {
  enforceMonotonicity,
  enforceMinDuration,
  fillMicroGaps,
  isTimingSuspicious,
  redistributeByCharCount,
  MIN_WORD_DURATION,
  MICRO_GAP_THRESHOLD,
  MIN_CHAR_WEIGHT,
};
