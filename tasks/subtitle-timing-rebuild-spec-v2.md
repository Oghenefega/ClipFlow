# Subtitle Timing Rebuild — Complete Specification v2

> Written: 2026-04-03 | Supersedes: subtitle-timing-rebuild-spec.md (v1)
> Status: DRAFT — pending approval | Priority: HIGH
> Trigger: User feedback — karaoke timing drift, subtitles showing early, highlights racing ahead of speech

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Root Cause Analysis](#2-root-cause-analysis)
3. [Research Findings](#3-research-findings)
4. [Architecture Overview](#4-architecture-overview)
5. [Phase 1 — Word Timestamp Post-Processing](#5-phase-1--word-timestamp-post-processing)
6. [Phase 2 — Segmentation Safe Fixes](#6-phase-2--segmentation-safe-fixes)
7. [Phase 3 — Unify Preview and Burn-In](#7-phase-3--unify-preview-and-burn-in)
8. [Phase 4 — Progressive Karaoke Highlight](#8-phase-4--progressive-karaoke-highlight)
9. [Constants Reference](#9-constants-reference)
10. [Integration Points](#10-integration-points)
11. [File Change Matrix](#11-file-change-matrix)
12. [Testing Plan](#12-testing-plan)
13. [Execution Order & Dependencies](#13-execution-order--dependencies)
14. [Research Sources](#14-research-sources)

---

## 1. Problem Statement

ClipFlow's karaoke subtitle highlighting drifts out of sync with speech. The drift is:
- **Progressive** — gets worse over time (barely noticeable at 5s, clearly visible at 40s+)
- **Always late** — the highlight lags behind the actual spoken word
- **Inconsistent** — some words are perfectly timed, others are 100-200ms off

Additionally, two critical bugs compound the timing problem:
1. The editor preview and the exported burn-in video use **different highlight algorithms**, producing different results
2. The `syncOffset` slider (user-adjustable timing correction) is **not applied during burn-in**, so the exported video ignores the user's sync adjustment

The user's experience: they tweak sync in the editor until it looks right, hit export, and the exported video doesn't match what they saw.

---

## 2. Root Cause Analysis

### 2a. Why Whisper's Word Timestamps Drift

Whisper's word-level timestamps come from Dynamic Time Warping (DTW) on cross-attention weights. This was designed for **utterance-level** alignment (which sentence was spoken when), not word-level precision. Known failure modes:

| Failure Mode | What Happens | Frequency |
|---|---|---|
| Near-zero word durations | Short words ("I", "a", "the") get 0-40ms duration — real speech is 100ms+ | Very common |
| Overestimated gaps | Attention is non-distinct during silence, so gaps between words are wider than reality | Common |
| Monotonicity violations | word[N+1].start < word[N].end — timestamps go backwards | Occasional |
| Cumulative drift | Each word's start time accumulates a small positive error, adding up over 30-60s | Always present |
| Identical durations | Different-length words in the same phrase get identical timestamps (attention blur) | Common |

**Every professional subtitle tool post-processes Whisper's output. We currently don't — we take it as ground truth.**

### 2b. Why the Drift is Visible (The Critical Insight)

Our karaoke highlight advances based on `word.start`, NOT `word.end`. Both `PreviewOverlays.js` and `overlay-renderer.js` use the same pattern:

```javascript
// The highlight advances to word[i] when currentTime >= word[i].start
if (adjustedTime >= globalWordIndex[i].word.start) bestGlobal = i;
```

The highlight jumps to the next word when playback reaches that word's `.start` time. It **does not care about `.end` at all** for highlight advancement. This means:

- Fixing `word.end` (gap filling, min duration extension) is cosmetically cleaner but **will not fix the visible drift**
- The only thing that fixes drift is correcting `word.start` values
- Whisper gives `word.start` values that are progressively too late, so the highlight lags behind speech

### 2c. Why Segments Show Too Early

Three segments in the test clip (`clip_1773883452956_geog`) appear 60-80ms before the first word is spoken. Root cause: `segmentWords.js` Phase 3 applies backward extension for min-duration enforcement. When a segment is shorter than `MIN_DISPLAY_DURATION` (0.3s), it extends `startSec` backward — potentially before the first word's actual `.start` time.

**Current code** (`segmentWords.js:398-409`):
```javascript
// Try extending start backward (down to end of previous segment)
const remaining = MIN_DISPLAY_DURATION - (segments[i].endSec - segments[i].startSec);
if (remaining > 0 && i > 0) {
  const minStart = segments[i - 1].endSec;
  const canExtendBack = segments[i].startSec - minStart;
  segments[i].startSec -= Math.min(remaining, Math.max(0, canExtendBack));
}
```

No guard prevents `startSec` from going before `words[0].start`.

### 2d. Preview vs Burn-In Divergence

Side-by-side comparison of the two `findActiveWord` implementations:

| Aspect | Preview (`PreviewOverlays.js:61-98`) | Burn-in (`overlay-renderer.js:100-127`) |
|---|---|---|
| **Search strategy** | Global word index — flat array of all words across all segments, searched linearly | Segment-first — iterate segments, find matching one, then search words within it |
| **Segment boundary** | `adjustedTime < seg.endSec` (exclusive) | `currentTime <= end` (inclusive) |
| **Tail hold** | 1.5s past `word.end` — keeps showing last word for 1.5s after it ends | None — word disappears the instant `currentTime > seg.endSec` |
| **Pre-word lookahead** | 0.15s before first word | 0.15s before first word |
| **syncOffset** | Applied: `adjustedTime = currentTime - syncOffset` | **NOT applied** — uses raw timestamp |
| **Fallback** | Falls back to segment-boundary search for segments without word data | Returns `{seg: null, wordIdx: -1}` if no segment matches |

These differences mean: (a) a word can be highlighted in preview but not in burn-in at the same timestamp, (b) the user's syncOffset adjustment has zero effect on the exported video, and (c) the 1.5s tail hold in preview masks gaps that show as blank frames in the export.

---

## 3. Research Findings

### 3a. What Professional Tools Do

| Tool | Technique | Min Word Duration | Gap Handling | Drift Strategy |
|---|---|---|---|---|
| **whisper-timestamped** | Monotonicity enforcement (midpoint averaging), median filtering on attention weights | 20ms | Recursive correction | Median filter smoothing |
| **stable-ts** | Silence snapping + VAD, post-inference adjustment | 100ms | Merge <150ms gaps | Silence-anchored correction |
| **CrisperWhisper** | Retokenized vocabulary (explicit space tokens), AttentionLoss training, pause splitting | 50ms | Split pauses evenly, 160ms cap | Better training (architectural fix) |
| **WhisperX** | External forced alignment (wav2vec2 CTC), VAD pre-segmentation | N/A (model-driven) | Model-driven | VAD chunks prevent drift accumulation |
| **Descript** | Proprietary forced alignment + audio fingerprinting | Unknown | Unknown | Re-alignment against audio waveform |
| **Aegisub** | No ASR — fully manual human timing in centisecond `\k` tags | N/A | N/A | Human precision |

**Key insight:** Every tool that produces accurate word timing either (a) re-aligns against the audio waveform, or (b) uses segment boundaries as anchors and redistributes within them. Raw Whisper word timestamps are universally treated as a first approximation.

### 3b. Character-Count Redistribution

When word-level timestamps look unreliable, redistribute timing within a segment proportionally by character count. Segment-level timestamps are far more accurate because they come from Whisper's utterance detection (which works well), not from DTW attention weights (which don't).

**Algorithm:**
```
Given: segment with words[], segment.startSec, segment.endSec
  speechStart = first_word.start  (or segment.startSec if unreliable)
  speechEnd = last_word.end  (or segment.endSec)
  total_chars = sum(max(word.length, MIN_CHAR_WEIGHT) for word in words)
  speech_duration = speechEnd - speechStart

  cursor = speechStart
  for each word:
    effective_chars = max(word.length, MIN_CHAR_WEIGHT)
    word_duration = speech_duration * (effective_chars / total_chars)
    word.start = cursor
    word.end = cursor + word_duration
    cursor = word.end
```

The `MIN_CHAR_WEIGHT` of 2-3 prevents single-letter words ("I", "a") from getting invisible durations.

**When to apply:** Not on every segment — only when timestamps look suspicious. Detection heuristics:
1. Multiple words with duration < 50ms in the same segment
2. Total word coverage < 60% of segment duration (huge unexplained gaps)
3. Two or more adjacent words with identical durations (attention blur)
4. Any monotonicity violation within the segment

### 3c. Aegisub Progressive Fill (`\kf`) — Implementation

From libass source code (`ass_render.c`, `process_karaoke_effects()`):

1. Calculate progress: `dt = (current_time - syllable_start) / (syllable_end - syllable_start)`
2. Map to pixel position: `x = x_start + (x_end - x_start) * dt`
3. Split each glyph bitmap at that x-position
4. Left side renders in primary color (highlighted), right side in secondary color (normal)

The sweep is **linear in time across pixel width**. It is NOT weighted by character count — a narrow "I" and a wide "W" get filled at the same pixels-per-second rate. This is natural because wider characters tend to take longer to pronounce.

**CSS equivalent options:**
- `background: linear-gradient(to right, highlightColor progress%, normalColor progress%)` with `background-clip: text` and `-webkit-text-fill-color: transparent`
- `clip-path: inset(0 (1-progress)*100% 0 0)` on a colored overlay span

### 3d. Netflix Subtitle Timing Standards

| Requirement | Specification |
|---|---|
| In-time accuracy | Within 1-2 frames of first frame of audio |
| At 24fps | 1 frame = 41.67ms → tolerance = **42-83ms** |
| At 30fps | 1 frame = 33.33ms → tolerance = **33-67ms** |
| At 60fps (gaming) | 1 frame = 16.67ms → tolerance = **17-33ms** |
| Minimum subtitle duration | 5/6 second (~833ms) per event |
| Maximum subtitle duration | 7 seconds per event |
| Minimum gap between subtitles | 2 frames between consecutive events |
| Out-time extension | At least 0.5s past audio end (when no next subtitle) |

Whisper word.start commonly drifts 50-200ms. At gaming framerates (60fps), even 50ms of drift is 3 frames — noticeably off. Post-processing is not optional.

### 3e. Silence Detection (Future Upgrade Path)

The single biggest accuracy improvement across all research is snapping word boundaries to speech/silence transitions detected from the audio waveform (stable-ts approach). This requires audio analysis capabilities we don't currently have in the renderer. It's documented here as the correct long-term solution but is **out of scope for this rebuild** — it would require:
- Audio amplitude extraction (via FFmpeg or Web Audio API in the renderer)
- Silence detection algorithm (amplitude quantization or Silero VAD)
- Boundary snapping logic

This is a Phase 5 for a future session.

---

## 4. Architecture Overview

### 4a. Current Data Flow

```
Whisper raw output
  → useSubtitleStore.initSegments()
      → mergeWordTokens() — combines sub-word tokens into full words
      → validateWords() — clamps to segment boundaries
      → stores as originalSegments[]
  → useSubtitleStore.setSegmentMode("3word")
      → gathers allWords[] from originalSegments
      → segmentWords(allWords, mode)
          → Phase 0: validateAndCleanInput() — filter invalid, fix swapped, sort
          → Phase 1: partitionByHardWalls() — sentence enders + 0.7s gaps
          → Phase 2: chunkPartition() — 3-word groups with rules 1-8
          → Phase 3: applyTimingRules() — gap close, min duration, linger
      → stores as editSegments[]
  → PreviewOverlays.SubtitleOverlay
      → buildGlobalWordIndex(segments) — flat word array
      → findActiveSegAndWord(segments, index, adjustedTime)
      → renders word spans with color = highlight/normal
  → overlay-renderer.js (burn-in, offscreen BrowserWindow)
      → findActiveWord(segments, currentTime) — segment-first search
      → renders DOM spans, captured as PNG frames
```

### 4b. Target Data Flow (Changes in **bold**)

```
Whisper raw output
  → useSubtitleStore.initSegments()
      → mergeWordTokens() — unchanged
      → validateWords() — unchanged
      → **cleanWordTimestamps(words, segStartSec, segEndSec)** — NEW, per-segment
      → stores as originalSegments[]
  → useSubtitleStore.setSegmentMode()
      → gathers allWords[] from originalSegments
      → **cleanWordTimestamps(allWords)** — NEW, cross-segment pass
      → segmentWords(allWords, mode)
          → Phase 0-2: unchanged
          → Phase 3: applyTimingRules() **+ startSec clamping + last-word extension + in-segment gap fill**
      → stores as editSegments[]
  → PreviewOverlays.SubtitleOverlay
      → buildGlobalWordIndex — unchanged
      → **findActiveWord(segments, index, time)** — RENAMED, shared algorithm
      → **progressive highlight** — gradient sweep instead of instant color
  → overlay-renderer.js
      → **findActiveWord(segments, index, time)** — SHARED algorithm (same code)
      → **adjustedTime = timestamp - syncOffset** — syncOffset now applied
      → **progressive highlight** — gradient sweep matching preview exactly
```

---

## 5. Phase 1 — Word Timestamp Post-Processing

### Overview

New file: `src/renderer/editor/utils/cleanWordTimestamps.js`

A pure function that takes raw Whisper word timestamps and produces corrected timestamps. Runs BEFORE `segmentWords()`. No side effects, no store dependencies, fully testable in isolation.

### Input / Output Contract

```javascript
/**
 * @param {Array<{word: string, start: number, end: number, probability?: number, track?: string}>} words
 * @param {object} [options]
 * @param {number} [options.segStart] — segment start time (anchor for redistribution)
 * @param {number} [options.segEnd] — segment end time (anchor for redistribution)
 * @returns {Array<{word: string, start: number, end: number, probability?: number, track?: string}>}
 *   New array of new objects. Never mutates input. Idempotent.
 */
export function cleanWordTimestamps(words, options = {}) { ... }
```

### Pass 1: Enforce Monotonicity

**What:** Ensure no word's `.start` is before the previous word's `.end`.

**Why:** Whisper occasionally produces overlapping timestamps where word N+1 starts before word N ends. This confuses the `findActiveWord` binary search and can cause highlight flicker.

**Algorithm** (from whisper-timestamped `ensure_increasing_positions()`):
```
For each word[i] where i > 0:
  if word[i].start < word[i-1].end:
    midpoint = (word[i-1].end + word[i].start) / 2
    // Guard: don't shrink previous word below MIN_WORD_DURATION
    if midpoint - word[i-1].start < MIN_WORD_DURATION:
      midpoint = word[i-1].start + MIN_WORD_DURATION
    word[i-1].end = midpoint
    word[i].start = midpoint
```

**Edge cases:**
- If both words have near-zero duration, midpoint still splits them equally
- If the overlap is larger than one word's total duration, the midpoint guard prevents the previous word from collapsing to zero

### Pass 2: Enforce Minimum Word Duration

**What:** Extend words shorter than 50ms.

**Why:** Whisper gives short function words ("I", "a", "the") near-zero durations because the attention mechanism can't distinguish their boundaries. A word with 10ms duration is invisible even with progressive fill.

**Algorithm:**
```
For each word:
  duration = word.end - word.start
  if duration < MIN_WORD_DURATION (0.05s):
    word.end = word.start + MIN_WORD_DURATION
    // Don't extend past next word's start (if next word exists)
    if nextWord exists:
      word.end = Math.min(word.end, nextWord.start)
```

**Why 50ms:** Compromise between whisper-timestamped (20ms — too short, still invisible) and stable-ts (100ms — too aggressive, steals time from neighbors). 50ms matches CrisperWhisper's threshold and is enough for a visible progressive sweep.

### Pass 3: Fill Micro-Gaps

**What:** Close small gaps between consecutive words by extending the earlier word's `.end`.

**Why:** Whisper overestimates inter-word gaps. A 100ms gap between "welcome" and "back" in continuous speech is an artifact — there's no actual silence there. Filling these gaps makes the progressive karaoke sweep continuous instead of stuttering through micro-pauses.

**Algorithm** (from stable-ts merge_gap approach):
```
For each consecutive pair word[i], word[i+1]:
  gap = word[i+1].start - word[i].end
  if gap > 0 and gap <= MICRO_GAP_THRESHOLD (0.15s):
    word[i].end = word[i+1].start  // extend prior word to fill
```

**Why 150ms:** Matches stable-ts default. Gaps under 150ms between words in continuous speech are almost always Whisper artifacts. Gaps over 150ms are likely real pauses — leave them untouched.

**Important nuance:** This pass modifies `.end`, not `.start`. It improves the smoothness of progressive fill but does NOT fix highlight advancement timing (which is `.start`-driven). It's cosmetic polish, not drift correction.

### Pass 4: Detect Suspicious Timestamps & Redistribute (THE DRIFT FIX)

**What:** When a segment's word timestamps look unreliable, redistribute word timing proportionally by character count, anchored to segment boundaries.

**Why this is the core fix:** Whisper's segment-level timestamps are accurate (utterance detection works well). Word-level timestamps within those segments drift. By treating the segment boundaries as ground truth and redistributing proportionally, we correct `word.start` values — which is what the karaoke highlight actually uses.

**Suspicion detection heuristics** — a segment's word timestamps are "suspicious" when ANY of these are true:

```javascript
function isTimingSuspicious(words, segStart, segEnd) {
  if (words.length < 2) return false;

  const segDuration = segEnd - segStart;
  const totalWordDuration = words.reduce((sum, w) => sum + (w.end - w.start), 0);

  // Heuristic 1: Multiple short words (3+ words under 50ms)
  const shortCount = words.filter(w => (w.end - w.start) < 0.05).length;
  if (shortCount >= 3) return true;

  // Heuristic 2: Words only cover <60% of segment duration
  // (huge unexplained gaps between words)
  if (segDuration > 0.2 && totalWordDuration / segDuration < 0.6) return true;

  // Heuristic 3: Adjacent words with identical durations (±5ms)
  // (attention blur — Whisper couldn't distinguish boundaries)
  let identicalPairs = 0;
  for (let i = 0; i < words.length - 1; i++) {
    const d1 = words[i].end - words[i].start;
    const d2 = words[i + 1].end - words[i + 1].start;
    if (Math.abs(d1 - d2) < 0.005) identicalPairs++;
  }
  if (identicalPairs >= 2) return true;

  // Heuristic 4: Any remaining monotonicity violations after Pass 1
  // (shouldn't happen, but safety net)
  for (let i = 1; i < words.length; i++) {
    if (words[i].start < words[i - 1].end - 0.001) return true;
  }

  return false;
}
```

**Redistribution algorithm:**

```javascript
function redistributeByCharCount(words, segStart, segEnd) {
  const MIN_CHAR_WEIGHT = 3;  // "I" and "a" get weight of 3, not 1

  // Use word boundaries as speech region (not full segment, which includes linger)
  const speechStart = Math.max(segStart, words[0].start);
  const speechEnd = Math.min(segEnd, words[words.length - 1].end);
  const speechDuration = speechEnd - speechStart;

  if (speechDuration <= 0) return words; // degenerate case

  // Calculate total weighted character count
  const totalChars = words.reduce((sum, w) => {
    const clean = (w.word || "").replace(/[^a-zA-Z0-9]/g, "");
    return sum + Math.max(clean.length, MIN_CHAR_WEIGHT);
  }, 0);

  if (totalChars === 0) return words; // no real text

  // Redistribute
  let cursor = speechStart;
  return words.map((w, i) => {
    const clean = (w.word || "").replace(/[^a-zA-Z0-9]/g, "");
    const effectiveChars = Math.max(clean.length, MIN_CHAR_WEIGHT);
    const wordDuration = speechDuration * (effectiveChars / totalChars);
    const newStart = cursor;
    const newEnd = cursor + wordDuration;
    cursor = newEnd;

    return { ...w, start: newStart, end: newEnd };
  });
}
```

**Why `MIN_CHAR_WEIGHT = 3`:** Without this, "I" (1 char) gets 1/50th of a segment with 50 total chars. At 2s segment duration, that's 40ms — barely visible even with progressive fill. Weight of 3 gives it 120ms minimum, which is perceptible.

**When redistribution is NOT applied:**
- Segments with only 1 word (nothing to redistribute)
- Segments where the heuristics say timestamps look fine
- Segments where no `segStart`/`segEnd` anchors were provided (cross-segment pass without context)

### Pass ordering

Passes must run in order: 1 → 2 → 3 → 4.

- Pass 1 (monotonicity) is prerequisite for all others — you can't reason about gaps or durations if timestamps overlap
- Pass 2 (min duration) ensures no word has zero duration before gap analysis
- Pass 3 (micro-gap fill) cleans up the `.end` values before redistribution decides if timestamps are suspicious
- Pass 4 (redistribution) may override `.start` and `.end` entirely for suspicious segments, so it must run last

### Immutability Contract

Every pass creates new word objects via spread: `{...word, start: newStart, end: newEnd}`. The input array and its objects are never mutated. This is critical because:
- The undo system in `useSubtitleStore` deep-copies via `JSON.stringify`
- `originalSegments` must remain unchanged for segment mode switching
- Running `cleanWordTimestamps` twice on the same input must produce identical output (idempotency)

---

## 6. Phase 2 — Segmentation Safe Fixes

### Overview

Modify: `src/renderer/editor/utils/segmentWords.js` — specifically `applyTimingRules()` and post-processing.

These are safe, non-breaking changes that fix visible bugs without changing segmentation logic. They build on Phase 1's cleaned timestamps.

### 2a. Clamp startSec to First Word's Start

**What:** After `applyTimingRules()` runs its min-duration backward extension, ensure no segment's `startSec` precedes its first word's `.start`.

**Why:** Three segments in the test clip appear 60-80ms before the first word is spoken. The subtitle shows on screen, but nothing is being said yet — it looks like the subtitle is "early". This is because min-duration backward extension pushed `startSec` before the first word.

**Where:** Add after the existing min-duration block in `applyTimingRules()`, before the linger block.

```javascript
// Clamp: segment must not appear before first word is spoken
for (let i = 0; i < segments.length; i++) {
  if (segments[i].words && segments[i].words.length > 0) {
    segments[i].startSec = Math.max(
      segments[i].startSec,
      segments[i].words[0].start
    );
  }
}
```

**Edge case:** If clamping pushes `startSec` forward and the segment is now shorter than `MIN_DISPLAY_DURATION` — that's acceptable. The word timing is more important than hitting the display floor. The progressive fill in Phase 4 will make even short segments feel smooth.

### 2b. Extend Last Word to Segment End

**What:** After `applyTimingRules()` adds linger time (extending `endSec` by 0.4s), extend the last word's `.end` to match the new `endSec`.

**Why:** Without this, there's a gap between the last word's `.end` and the segment's `endSec` (the linger period). During this gap, the progressive karaoke sweep has nowhere to go — the last word appears "done" but the segment is still showing. This creates a frozen highlight for 0.4s. Extending the last word's `.end` makes the progressive sweep naturally decelerate through the linger.

**Where:** After `applyTimingRules()` returns, in the caller.

```javascript
// Extend last word to fill linger period
for (const seg of segments) {
  if (seg.words && seg.words.length > 0) {
    const lastWord = seg.words[seg.words.length - 1];
    if (lastWord.end < seg.endSec) {
      seg.words[seg.words.length - 1] = { ...lastWord, end: seg.endSec };
    }
  }
}
```

**Immutability note:** Creates a new word object for the last word. Other words in the segment are untouched.

### 2c. Fill Intra-Segment Word Gaps

**What:** After segmentation, close any remaining micro-gaps between consecutive words within the same segment.

**Why:** Phase 1 Pass 3 fills micro-gaps on the raw word array, but `segmentWords()` may create new timing adjustments that re-introduce small gaps. This is a safety net that ensures continuous progressive fill within each segment.

**Where:** After `applyTimingRules()` returns, after 2b.

```javascript
// Close remaining intra-segment micro-gaps
for (const seg of segments) {
  if (!seg.words || seg.words.length < 2) continue;
  for (let i = 0; i < seg.words.length - 1; i++) {
    const gap = seg.words[i + 1].start - seg.words[i].end;
    if (gap > 0 && gap < 0.15) {
      seg.words[i] = { ...seg.words[i], end: seg.words[i + 1].start };
    }
  }
}
```

**Why this is safe:** Only closes gaps < 150ms (same threshold as Phase 1 Pass 3). Never moves `.start` values. Only extends `.end` forward. Cannot create overlaps because it only fills existing gaps.

---

## 7. Phase 3 — Unify Preview and Burn-In

### Overview

Replace the two divergent `findActiveWord` implementations with a single shared algorithm. Fix syncOffset to be applied in burn-in. This is the prerequisite for Phase 4 (progressive highlight) — we need one rendering path before adding the gradient sweep.

### 3a. The Shared Algorithm

**New file:** `src/renderer/editor/utils/findActiveWord.js`

This file must be **plain JavaScript** — no JSX, no React imports, no ES module syntax that won't work in the offscreen BrowserWindow. It will be loaded by both:
- `PreviewOverlays.js` (React context, ES modules)
- `overlay-renderer.js` (offscreen BrowserWindow, `require()`)

**Strategy for dual compatibility:** Export as a standalone function file. The React side imports it via ES modules. The burn-in side loads it via a path injected by the main process (same pattern used for `subtitleStyleEngine.js` — see `overlay-renderer.js:16-22`).

**Algorithm** (based on preview's superior global word index approach):

```javascript
/**
 * Find the active segment and word index at a given time.
 *
 * @param {Array} segments — subtitle segments with .words arrays
 * @param {Array} globalWordIndex — flat index built by buildGlobalWordIndex()
 * @param {number} time — current playback time (already adjusted for syncOffset)
 * @returns {{ seg: object|null, wordIdx: number, wordProgress: number }}
 *   wordProgress is 0-1 within the active word (for progressive fill)
 */
function findActiveWord(segments, globalWordIndex, time) {
  if (!segments || segments.length === 0) return { seg: null, wordIdx: -1, wordProgress: 0 };

  if (globalWordIndex.length > 0) {
    // Find the most recent word that has started
    let bestGlobal = -1;
    for (let i = 0; i < globalWordIndex.length; i++) {
      if (time >= globalWordIndex[i].word.start) bestGlobal = i;
      else break; // sorted by time, can early-exit
    }

    if (bestGlobal >= 0) {
      const entry = globalWordIndex[bestGlobal];
      const seg = segments[entry.segIdx];
      const word = entry.word;

      // Must be within segment boundaries AND within tail hold period
      if (time >= seg.startSec && time < seg.endSec && time <= word.end + TAIL_HOLD_DURATION) {
        // Calculate progress within this word (0 = just started, 1 = fully spoken)
        const wordDuration = word.end - word.start;
        const wordProgress = wordDuration > 0
          ? Math.min(1, Math.max(0, (time - word.start) / wordDuration))
          : 1; // zero-duration word = instantly complete

        return { seg, wordIdx: entry.wordIdx, wordProgress };
      }
    }

    // Before any word: check if we're close to the first word (lookahead)
    if (bestGlobal < 0 && globalWordIndex.length > 0) {
      const firstEntry = globalWordIndex[0];
      const seg = segments[firstEntry.segIdx];
      if (time >= firstEntry.word.start - PRE_WORD_LOOKAHEAD &&
          time >= seg.startSec && time < seg.endSec) {
        return { seg, wordIdx: firstEntry.wordIdx, wordProgress: 0 };
      }
    }
  }

  // Fallback: segment without word data — use segment boundaries
  const seg = segments.find(s => time >= s.startSec && time < s.endSec) || null;
  return { seg, wordIdx: -1, wordProgress: 0 };
}
```

**Key design decisions:**

1. **`<` for endSec boundary (exclusive):** Matches segment ownership semantics. If segment A ends at 5.0 and segment B starts at 5.0, time 5.0 belongs to segment B. The inclusive `<=` in the old burn-in code caused double-matching at boundaries.

2. **1.5s tail hold:** Keeps the last word visible for 1.5s after `word.end`. Without this, there would be blank frames between segments wherever the gap exceeds a few ms. The old burn-in had no tail hold, causing visible flicker in exports.

3. **`wordProgress` return value:** New — enables Phase 4's progressive fill. Returns 0-1 representing how far through the current word we are. Callers that don't need it can ignore it. Zero-duration words return progress = 1 (instantly complete).

4. **`buildGlobalWordIndex` also shared:** Extract from `PreviewOverlays.js` into the same file. The burn-in renderer will use it too, building the index once in `__initOverlay__` instead of re-scanning segments every frame.

### 3b. Integration with PreviewOverlays.js

Replace `findActiveSegAndWord` and `buildGlobalWordIndex` with imports from the shared utility:

```javascript
import { findActiveWord, buildGlobalWordIndex } from "../utils/findActiveWord";
```

The only change in the component logic: `findActiveSegAndWord` returns `{ seg, wordIdx }`, the new function returns `{ seg, wordIdx, wordProgress }`. Update destructuring to capture `wordProgress` (used in Phase 4).

### 3c. Integration with overlay-renderer.js

1. Main process injects path: `window.__FIND_ACTIVE_WORD_PATH__ = "path/to/findActiveWord.js"`
2. `overlay-renderer.js` loads it: `const { findActiveWord, buildGlobalWordIndex } = require(window.__FIND_ACTIVE_WORD_PATH__)`
3. Build global word index once in `__initOverlay__`: `globalWordIndex = buildGlobalWordIndex(subtitleSegments)`
4. Apply syncOffset: `const adjustedTime = timestamp - (config.syncOffset || 0)`
5. Replace old `findActiveWord` call: `const { seg, wordIdx, wordProgress } = findActiveWord(subtitleSegments, globalWordIndex, adjustedTime)`

**Where syncOffset comes from:** Added to `window.__OVERLAY_CONFIG__` by the main process. The editor store already saves syncOffset to clip data. The burn-in pipeline reads clip data to build the overlay config. The only missing link is passing it through — a one-line addition in the main process.

### 3d. Main Process Change (syncOffset passthrough)

**File:** `src/main/main.js` (or wherever overlay config is built for burn-in)

Find where `__OVERLAY_CONFIG__` is constructed and add:
```javascript
syncOffset: clip.syncOffset || 0,
```

This is a data-passthrough change — no logic, no risk.

---

## 8. Phase 4 — Progressive Karaoke Highlight

### Overview

Replace instant word color change with a linear gradient sweep across each word's duration. This is the Aegisub `\kf` standard. Even with 50-80ms timing error, the progressive fill looks smooth because the eye tracks the sweep motion.

### 8a. How It Works

**Current behavior:**
- Active word: `color: highlightColor` (instant full color)
- All other words: `color: normalColor`
- CSS `transition: color 0.1-0.2s` adds minor easing

**Target behavior:**
- Active word: gradient sweep from left to right, progress = `wordProgress` from `findActiveWord`
- Already-spoken words (index < currentWordIdx): fully highlighted
- Future words (index > currentWordIdx): normal color
- Zero-duration words: instant highlight (no division by zero)

### 8b. CSS Implementation (PreviewOverlays.js)

For each word span in the active segment:

```javascript
const getWordStyle = (isActive, isPast, wordProgress) => {
  if (isPast) {
    // Already spoken — fully highlighted
    return {
      color: highlightColor,
      textShadow: wordShadows.active,
    };
  }

  if (!isActive) {
    // Future word — normal color
    return {
      color: normalColor,
      textShadow: wordShadows.normal,
    };
  }

  // Active word — progressive gradient sweep
  const pct = (wordProgress * 100).toFixed(1);
  return {
    background: `linear-gradient(to right, ${highlightColor} ${pct}%, ${normalColor} ${pct}%)`,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    // Shadows must go on a wrapper or use filter instead of textShadow
    // (textShadow doesn't work with background-clip: text)
    filter: buildFilterFromShadow(wordShadows.active), // if needed
  };
};
```

**The textShadow problem:** When using `background-clip: text` with `-webkit-text-fill-color: transparent`, `text-shadow` renders relative to the transparent text, not the gradient. Solutions:
1. Use a wrapper `<span>` with the shadow, and an inner `<span>` with the gradient
2. Use CSS `filter: drop-shadow()` instead of `text-shadow`
3. Use `clip-path: inset(0 X% 0 0)` approach instead (avoids the text-fill-color issue entirely)

**Recommended: `clip-path` approach** — simpler, avoids the shadow issue:

```javascript
// For the active word, render TWO overlapping spans:
// 1. Base span: normalColor (full width)
// 2. Overlay span: highlightColor with clip-path revealing left portion

// Base (normal color, always visible)
<span style={{ color: normalColor, textShadow: wordShadows.normal, position: 'relative' }}>
  {wordText}
  {/* Overlay (highlighted color, clipped to progress) */}
  <span style={{
    position: 'absolute',
    left: 0, top: 0,
    color: highlightColor,
    textShadow: wordShadows.active,
    clipPath: `inset(0 ${(100 - wordProgress * 100).toFixed(1)}% 0 0)`,
  }}>
    {wordText}
  </span>
</span>
```

This preserves `textShadow` on both the highlighted and normal portions correctly.

### 8c. DOM Implementation (overlay-renderer.js)

Same `clip-path` approach, but with DOM manipulation:

```javascript
function renderWordWithProgress(word, isActive, isPast, wordProgress, highlightColor, normalColor, shadows) {
  const wrapper = document.createElement("span");
  wrapper.style.position = "relative";
  wrapper.style.display = "inline-block";

  // Base text (normal color)
  const base = document.createElement("span");
  base.textContent = word;
  base.style.color = isPast ? highlightColor : normalColor;
  base.style.textShadow = isPast ? shadows.active : shadows.normal;
  wrapper.appendChild(base);

  // Progressive overlay (only for active word)
  if (isActive && wordProgress > 0 && wordProgress < 1) {
    const overlay = document.createElement("span");
    overlay.textContent = word;
    overlay.style.position = "absolute";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.color = highlightColor;
    overlay.style.textShadow = shadows.active;
    overlay.style.clipPath = `inset(0 ${(100 - wordProgress * 100).toFixed(1)}% 0 0)`;
    wrapper.appendChild(overlay);
  }

  return wrapper;
}
```

**Performance note for burn-in:** The overlay renderer captures frames at specific timestamps via `__seekTo__`. It doesn't animate in real-time — each frame is a single render at a single timestamp. So the `clip-path` is just a static value per frame, not an animation. No performance concern.

### 8d. Interaction with Existing Animations

The editor supports two animation modes:
- **Scale animation** (`animateOn + !isSingleWord`): active word scales up (e.g., 1.2x)
- **Grow animation** (`animateOn + isSingleWord`): word grows from `animateGrowFrom` to 1.0

Progressive fill works alongside both. The scale/grow is on the `transform` property, the progressive fill is on `clip-path` or `background` — they don't conflict. However:

- In single-word mode, there's only one word per segment. Progressive fill still applies — the single word fills left-to-right over its duration. This replaces the instant color pop with a smooth reveal that pairs well with the grow animation.
- The `transition: color` on word spans should be removed or minimized — the progressive fill handles the transition now, and CSS color transitions would fight with the gradient.

### 8e. Fallback for Segments Without Word Data

If a segment has no `words` array (text-only fallback), progressive fill cannot apply (we don't know individual word boundaries). Keep existing behavior: display the segment text with normal color, no karaoke.

---

## 9. Constants Reference

| Constant | Value | Unit | Source | Used In | Rationale |
|---|---|---|---|---|---|
| `MIN_WORD_DURATION` | 0.05 | seconds | CrisperWhisper | Phase 1 Pass 2 | 50ms = visible with progressive fill; compromise between whisper-timestamped (20ms) and stable-ts (100ms) |
| `MICRO_GAP_THRESHOLD` | 0.15 | seconds | stable-ts | Phase 1 Pass 3, Phase 2c | Gaps <150ms in continuous speech are Whisper artifacts; >150ms are real pauses |
| `MIN_CHAR_WEIGHT` | 3 | chars | Custom | Phase 1 Pass 4 | Prevents "I"/"a" from getting sub-40ms durations in redistribution |
| `SUSPICIOUS_SHORT_COUNT` | 3 | words | Custom | Phase 1 Pass 4 | 3+ words under 50ms in one segment = unreliable timestamps |
| `SUSPICIOUS_COVERAGE_RATIO` | 0.6 | ratio | Custom | Phase 1 Pass 4 | Words covering <60% of segment duration = large unexplained gaps |
| `SUSPICIOUS_IDENTICAL_PAIRS` | 2 | pairs | Custom | Phase 1 Pass 4 | 2+ adjacent word pairs with ±5ms identical duration = attention blur |
| `TAIL_HOLD_DURATION` | 1.5 | seconds | Existing | Phase 3 shared algo | Prevents blank flashes between segments |
| `PRE_WORD_LOOKAHEAD` | 0.15 | seconds | Existing | Phase 3 shared algo | Shows first word slightly early for perception of "on time" |
| `LINGER_DURATION` | 0.4 | seconds | Existing | segmentWords.js | Subtitle stays on screen briefly after last word |
| `MIN_DISPLAY_DURATION` | 0.3 | seconds | Existing | segmentWords.js | Minimum segment display time |
| `PAUSE_SPLIT_THRESHOLD` | 0.7 | seconds | Existing | segmentWords.js | Hard wall for partitioning |

---

## 10. Integration Points

### 10a. Where `cleanWordTimestamps` Gets Called

**Call site 1: `useSubtitleStore.initSegments()`** — per-segment cleaning

After `mergeWordTokens()` and `validateWords()` produce `repairedWords`, and before the segment object is built:

```javascript
// Current (line ~417-418):
const rawWords = mergeWordTokens(cleanWords, s.text);
const repairedWords = validateWords(rawWords, segStartSec, segEndSec);

// Target:
const rawWords = mergeWordTokens(cleanWords, s.text);
const validatedWords = validateWords(rawWords, segStartSec, segEndSec);
const repairedWords = cleanWordTimestamps(validatedWords, {
  segStart: segStartSec,
  segEnd: segEndSec,
});
```

This runs per-segment with segment boundary anchors, enabling Pass 4 redistribution.

**Call site 2: `useSubtitleStore.setSegmentMode()`** — cross-segment cleaning

After gathering `allWords` from all original segments, before passing to `segmentWords()`:

```javascript
// Current (line ~963):
const rawSegs = segmentWords(allWords, mode).map(...)

// Target:
const cleanedWords = cleanWordTimestamps(allWords);
const rawSegs = segmentWords(cleanedWords, mode).map(...)
```

This runs without segment anchors (cross-segment), so Pass 4 redistribution won't apply. Passes 1-3 (monotonicity, min duration, micro-gap fill) still run. This is correct because `setSegmentMode` is re-segmenting — the segmentation will create new segment boundaries, and Phase 2 fixes (startSec clamp, last-word extension) will handle the rest.

### 10b. Where the Shared `findActiveWord` Gets Loaded

**In `PreviewOverlays.js`:** Standard ES import at top of file.

**In `overlay-renderer.js`:** Loaded via `require()` from a path injected by the main process, same pattern as `subtitleStyleEngine.js`. The main process must:
1. Resolve the path to `findActiveWord.js` at build time
2. Inject it as `window.__FIND_ACTIVE_WORD_PATH__`
3. The renderer loads it in `loadFindActiveWord()` called during init

**In `main.js` (burn-in setup):** Pass syncOffset in the overlay config and inject the findActiveWord module path.

### 10c. Import Chain (no circular dependencies)

```
cleanWordTimestamps.js  ← pure utility, imports nothing from our code
findActiveWord.js       ← pure utility, imports nothing from our code
segmentWords.js         ← pure utility, imports nothing from our code (unchanged)
useSubtitleStore.js     ← imports cleanWordTimestamps, segmentWords
PreviewOverlays.js      ← imports findActiveWord, buildGlobalWordIndex
overlay-renderer.js     ← requires findActiveWord via injected path
main.js                 ← passes syncOffset + findActiveWord path in overlay config
```

No circular dependencies. All new files are pure utilities.

---

## 11. File Change Matrix

| File | Phase | Action | Changes |
|---|---|---|---|
| `src/renderer/editor/utils/cleanWordTimestamps.js` | 1 | **CREATE** | 4-pass post-processor: monotonicity, min duration, micro-gap fill, suspicious detection + redistribution |
| `src/renderer/editor/utils/findActiveWord.js` | 3 | **CREATE** | Shared `findActiveWord` + `buildGlobalWordIndex`, plain JS (no React), dual export (ESM + CJS) |
| `src/renderer/editor/utils/segmentWords.js` | 2 | MODIFY | Add startSec clamping, last-word extension, intra-segment gap fill after `applyTimingRules()` |
| `src/renderer/editor/stores/useSubtitleStore.js` | 1 | MODIFY | Import + call `cleanWordTimestamps` in `initSegments()` and `setSegmentMode()` |
| `src/renderer/editor/components/PreviewOverlays.js` | 3, 4 | MODIFY | Import shared `findActiveWord`, add progressive highlight rendering with `clip-path` |
| `public/subtitle-overlay/overlay-renderer.js` | 3, 4 | MODIFY | Load shared `findActiveWord`, apply syncOffset, add progressive highlight DOM rendering |
| `src/main/main.js` | 3 | MODIFY | Pass `syncOffset` + `findActiveWord` module path in overlay config |
| `src/renderer/editor/utils/cleanWordTimestamps.test.js` | 1 | **CREATE** | Unit tests for all 4 passes + edge cases |

### Files NOT Modified
| File | Reason |
|---|---|
| `useEditorStore.js` | Save/load already works (fixed in prior session) |
| `useCaptionStore.js` | Captions don't use word-level karaoke |
| `useLayoutStore.js` | Layout positioning unrelated to timing |
| `usePlaybackStore.js` | rAF loop timing unrelated (provides currentTime) |
| `subtitleStyleEngine.js` | Style computation unrelated to timing |

---

## 12. Testing Plan

### 12a. Unit Tests — `cleanWordTimestamps.test.js`

| Test Case | Input | Expected | Validates |
|---|---|---|---|
| Pass-through clean data | Words with no issues | Identical output (new objects) | Idempotency, immutability |
| Overlapping timestamps | word[1].start < word[0].end | Midpoint split, both words > 0 duration | Pass 1 monotonicity |
| Near-zero duration word | word with 10ms duration | Extended to 50ms | Pass 2 min duration |
| Min duration doesn't overflow | Short word followed by another at +30ms | Extended to min of 50ms or next word's start | Pass 2 boundary guard |
| Micro-gap filled | Two words with 100ms gap | First word's end extended to second word's start | Pass 3 gap fill |
| Real pause preserved | Two words with 500ms gap | Gap left untouched | Pass 3 threshold |
| Suspicious: multiple short | 5 words all with 20ms duration | Redistributed by char count | Pass 4 detection + redistribution |
| Suspicious: low coverage | Words covering 40% of segment | Redistributed by char count | Pass 4 detection + redistribution |
| Suspicious: identical durations | 3 adjacent pairs with same duration | Redistributed by char count | Pass 4 detection + redistribution |
| Redistribution proportionality | "I" vs "welcome" in same segment | "welcome" gets ~2.3x more time than "I" (7 chars vs MIN_CHAR_WEIGHT 3) | Pass 4 char weighting |
| Single word segment | One word with segment anchors | No redistribution (nothing to redistribute) | Pass 4 skip condition |
| No segment anchors | Words without segStart/segEnd | Passes 1-3 run, Pass 4 skipped | Cross-segment mode |
| Idempotent | Run twice on same input | Identical output both times | Full pipeline idempotency |
| Empty input | [] | [] | Edge case |
| Single word input | One word | Same word (new object) | Edge case |

### 12b. Unit Tests — `segmentWords.js` additions

| Test Case | Validates |
|---|---|
| Segment startSec >= first word.start after timing rules | Phase 2a clamp |
| Last word.end equals segment.endSec after linger | Phase 2b extension |
| No intra-segment gaps > 0 and < 150ms remain | Phase 2c gap fill |
| 1word mode: startSec clamp still applies | Phase 2a in 1word mode |
| 1word mode: last-word extension still applies | Phase 2b in 1word mode |

### 12c. Visual Tests (Manual)

| Test | What to Check | Pass Criteria |
|---|---|---|
| Open `clip_1773883452956_geog` | Karaoke highlight at "as always" (~35s) | Highlight matches speech — no visible lag |
| Watch full 56s clip | Progressive drift | No drift at end of clip (or <50ms) |
| Progressive sweep | Active word fills left-to-right | Smooth sweep, not instant color pop |
| Compare preview to export | Render 10s clip, compare side-by-side | Timing matches within 1 frame |
| Adjust syncOffset | Move slider ±200ms, check both preview and export | Both shift identically |
| Switch segment modes | Toggle 1word/3word in editor | No crash, timestamps remain reasonable |
| Style persistence | Open editor, change styles, leave, return | Styles persist (regression from prior fix) |
| Long clip (2+ min) | If available, test extended content | No cumulative drift |

### 12d. Edge Cases

| Scenario | Expected Behavior |
|---|---|
| Clip with no word timestamps | Fallback: segment-level display only, no karaoke |
| Single-word segments | Progressive fill on one word, fills over word duration |
| Very fast speech (many words <100ms apart) | Micro-gap fill connects them, progressive fill sweeps quickly |
| Long pauses (3+ seconds) | No phantom highlights during silence (tail hold expires at 1.5s) |
| Filler words ("um", "uh") with weird timing | Isolated into own segments by segmentation Rule 2, cleaned by Phase 1 |
| All words in segment have 0ms duration | Pass 2 extends all to 50ms, Pass 4 redistributes by char count |
| Word with probability = 0 | Still processed (probability is informational, not filtering) |

---

## 13. Execution Order & Dependencies

```
Phase 1 (cleanWordTimestamps.js)
  ↓  — biggest impact, creates foundation for all other phases
  ↓  — independently shippable: improves timing even with old highlight code
  ↓
Phase 2 (segmentation safe fixes)
  ↓  — builds on Phase 1's cleaned timestamps
  ↓  — independently shippable: fixes "early subtitle" and linger gaps
  ↓
Phase 3 (unify preview/burn-in)
  ↓  — prerequisite for Phase 4 (need one rendering path before adding gradient)
  ↓  — independently shippable: fixes preview/export divergence + syncOffset bug
  ↓
Phase 4 (progressive karaoke highlight)
     — requires Phase 3's wordProgress return value
     — independently shippable: visual upgrade, masks remaining timing imprecision
```

**Each phase gets its own commit.** Never combine phases in one commit — if a phase introduces a regression, we need to revert cleanly.

**Verification between phases:** After each phase, build and visually verify with `clip_1773883452956_geog`. The drift at "as always" is the primary benchmark. Each phase should show measurable improvement:
- After Phase 1: word.start values closer to speech onset, less drift
- After Phase 2: no subtitles appearing before speech, smooth linger
- After Phase 3: export matches preview exactly, syncOffset works in export
- After Phase 4: highlight sweeps smoothly, remaining timing imprecision masked

---

## 14. Research Sources

### Academic
- Whisper internal aligner (arxiv 2509.09987): DTW attention-based alignment limitations — explains why word-level timestamps accumulate error
- CrisperWhisper (arxiv 2408.16589): 50ms min duration, 160ms gap cap, retokenized vocabulary for pause detection
- University of Leuven (2021): Subtitles timed within 100ms of speech onset improve comprehension by 32%

### Open Source (code-level)
- whisper-timestamped v1.15.9 (`transcribe.py`): `ensure_increasing_positions()` — monotonicity enforcement via midpoint averaging
- stable-ts v2.0.0: `suppress_silence()`, `min_word_dur=0.1`, `merge_gap=0.15` — silence-anchored correction
- WhisperX v3.8.5 (`align.py`): CTC trellis alignment, `interpolate_nans()` for missing timestamps, VAD pre-segmentation with `vad_onset=0.500`
- libass (`ass_render.c`): `process_karaoke_effects()` — progressive fill pixel sweep, linear in time, split glyph bitmaps at sweep position

### Industry Standards
- Netflix Timed Text Style Guide: 1-2 frame sync tolerance (42-83ms at 24fps), 833ms min subtitle duration, 2-frame min gap
- EBU-TT (European Broadcasting Union): Frame-based timing, similar tolerances
- Descript: ±18ms average sync (elite tier, proprietary forced alignment)

### ClipFlow Internal
- Test clip: `clip_1773883452956_geog` — 163 words, 81 segments, 56s duration
  - 6 words with zero or near-zero duration (Whisper artifacts)
  - 3 segments start 60-80ms before first word (Phase 2a target)
  - Drift starts at "as always" — word gap 545ms, word durations 30-40ms
  - Progressive drift accumulates from this point through end of clip
