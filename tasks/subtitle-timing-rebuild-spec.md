# Subtitle Timing Rebuild — Full Spec

> Written: 2026-04-03 | Status: APPROVED, not started | Priority: HIGH
> Trigger: User feedback — karaoke timing drift, subtitles showing early, highlights racing ahead

---

## Problem Statement

ClipFlow takes Whisper word timestamps as gospel. Every professional competitor post-processes them. Whisper's DTW-based word alignment produces:
- Words with 0-40ms durations (real speech: 200ms+)
- Overestimated gaps between words (attention is non-distinct during silence)
- Monotonicity violations (word N+1 starts before word N ends)
- Cumulative drift over longer audio

Additionally, our karaoke highlight uses **instant color change** — the most timing-sensitive approach. Any Whisper error is immediately visible.

Two critical bugs compound this:
1. Preview and burn-in use **different highlight algorithms** (divergent results)
2. syncOffset is **not applied in burn-in** (editor preview ≠ exported video)

---

## Research Findings (Sources)

### Industry Standards
- Netflix sync tolerance: **40-80ms** (our target)
- Descript: ±18ms average (elite tier)
- Minimum subtitle duration: ~833ms (Netflix)
- Minimum gap between subtitles: ~83ms (Netflix)

### What Competitors Do
| Tool | Technique | Min Duration | Gap Handling |
|------|-----------|-------------|--------------|
| whisper-timestamped | Monotonicity enforcement (midpoint averaging) | 20ms | Recursive correction |
| stable-ts | Silence snapping + VAD | 100ms | Merge <150ms gaps |
| CrisperWhisper | Cap inter-word gaps at 160ms, remove <50ms words | 50ms | Split pauses evenly |
| WhisperX | Replace timestamps entirely (forced alignment) | N/A | Model-driven (too heavy) |
| Aegisub | Progressive fill karaoke (`\kf` tag) | N/A | Visual masking of errors |

### Key Insight: Progressive Karaoke
Aegisub's `\kf` mode **linearly sweeps** highlight across word duration instead of instant color. This masks timing errors up to ~100ms because the eye tracks motion. CapCut uses the same technique.

---

## Architecture Overview

### Current Flow
```
Whisper word timestamps (raw)
  → segmentWords.js (grouping only, no timestamp correction)
    → Phase 1: Hard wall partitioning (sentence enders, gaps ≥ 0.7s)
    → Phase 2: Smart chunking (3-word groups, rules 1-8)
    → Phase 3: Timing adjustments (gap close, min duration, linger)
  → editSegments (stored in useSubtitleStore)
    → PreviewOverlays.js (findActiveSegAndWord — global word index, 1.5s tail hold)
    → overlay-renderer.js (findActiveWord — segment-first, NO tail hold, NO syncOffset)
```

### Target Flow
```
Whisper word timestamps (raw)
  → cleanWordTimestamps.js [NEW] (3-pass post-processing)
    → Pass 1: Enforce monotonicity (midpoint averaging)
    → Pass 2: Enforce min duration (50ms)
    → Pass 3: Fill micro-gaps (<150ms)
  → segmentWords.js (grouping — unchanged)
    → Phase 1-2: Same
    → Phase 3: Timing adjustments + startSec clamping + last-word extension
  → editSegments
    → SHARED findActiveWord algorithm (used by both preview and burn-in)
    → Progressive karaoke highlight (linear sweep within word duration)
    → syncOffset applied in both preview AND burn-in
```

---

## Phase 1 — Word Timestamp Post-Processing

**New file:** `src/renderer/editor/utils/cleanWordTimestamps.js`

Pure function, no side effects. Runs on raw Whisper words BEFORE `segmentWords()`.

### Pass 1: Enforce Monotonicity
From whisper-timestamped's `ensure_increasing_positions()`:
```
For each word[i] where i > 0:
  if word[i].start < word[i-1].end:
    midpoint = (word[i-1].end + word[i].start) / 2
    word[i-1].end = midpoint
    word[i].start = midpoint
```
Guard: midpoint must leave previous word with at least MIN_WORD_DURATION.

### Pass 2: Enforce Minimum Duration
```
For each word:
  if word.end - word.start < MIN_WORD_DURATION:
    word.end = word.start + MIN_WORD_DURATION
```
Constant: `MIN_WORD_DURATION = 0.05` (50ms) — compromise between whisper-timestamped (20ms) and stable-ts (100ms). 50ms is CrisperWhisper's threshold.

### Pass 3: Fill Micro-Gaps
From stable-ts merge_gap approach:
```
For each consecutive pair word[i], word[i+1]:
  gap = word[i+1].start - word[i].end
  if gap > 0 and gap <= MICRO_GAP_THRESHOLD:
    word[i].end = word[i+1].start  // extend prior word to fill gap
```
Constant: `MICRO_GAP_THRESHOLD = 0.15` (150ms) — matches stable-ts default.

Gaps > 150ms are real pauses — leave them untouched.

### Implementation Notes
- All word modifications must create NEW objects (`{...word, end: newEnd}`) — no in-place mutation
- Input: `Array<{word, start, end, probability?}>` → Output: same shape, cleaned
- Must be idempotent (running twice = same result)

---

## Phase 2 — Progressive Karaoke Highlight

**Modify:** `src/renderer/editor/components/PreviewOverlays.js` (SubtitleOverlay)
**Modify:** `public/subtitle-overlay/overlay-renderer.js` (burn-in)

### Current Behavior
- Active word gets `color: highlightColor` (instant switch)
- All other words get `color: normalColor`
- CSS transition on `color` provides minor easing

### Target Behavior (Aegisub `\kf` style)
- Active word gets a **gradient fill** that sweeps left-to-right over the word's duration
- Progress = `(currentTime - word.start) / (word.end - word.start)`, clamped 0-1
- Implemented via CSS `background: linear-gradient(to right, highlightColor progress%, normalColor progress%)`
  with `background-clip: text` and `-webkit-text-fill-color: transparent`
- OR: use `clip-path: inset(0 (1-progress)*100% 0 0)` on a colored overlay span
- Already-spoken words: fully highlighted
- Future words: normal color
- Fallback for `word.end === word.start`: instant highlight (avoid division by zero)

### Why This Matters
Progressive fill visually masks timing errors up to ~100ms. The eye tracks the sweep motion and perceives it as "in sync" even when the boundary is slightly off. Instant color change makes every ms of error visible.

---

## Phase 3 — Unify Preview and Burn-In

**Current divergence:**

| Aspect | Preview (PreviewOverlays.js) | Burn-in (overlay-renderer.js) |
|--------|------------------------------|-------------------------------|
| Algorithm | Global word index scan | Segment-first scan |
| Tail hold | 1.5s past word.end | None |
| Boundary check | `time < seg.endSec` (exclusive) | `time <= seg.endSec` (inclusive) |
| syncOffset | Applied | NOT applied |
| Pre-word lookahead | 0.15s | 0.15s |

### Target: One Shared Algorithm

Extract `findActiveWord(segments, globalWordIndex, time)` into a shared utility.

- Use global word index approach (preview's current method — more robust)
- Keep 1.5s tail hold (prevents blank flashes between segments)
- Use `<` for endSec boundary (exclusive — matches segment ownership semantics)
- Apply syncOffset in burn-in: `const adjustedTime = timestamp - (syncOffset || 0)`
- syncOffset must be passed to the burn-in renderer via `window.__subtitleConfig__` or similar

**File:** New shared utility, imported by both PreviewOverlays.js and overlay-renderer.js.

Note: overlay-renderer.js runs in an offscreen BrowserWindow (not in React), so the shared code must be plain JS (no JSX, no imports from React modules). Options:
- Duplicate the function in both files (simpler, slight maintenance cost)
- Extract to a standalone JS file loaded by both contexts

---

## Phase 4 — Segmentation Safe Fixes

**Modify:** `src/renderer/editor/utils/segmentWords.js`

### 4a. Clamp startSec to First Word's Start
In `applyTimingRules()`, after min-duration backward extension:
```
For each segment:
  if segment.words.length > 0:
    segment.startSec = Math.max(segment.startSec, segment.words[0].start)
```
Prevents segments from appearing before the first word is spoken.

### 4b. Extend Last Word to Segment End
After `applyTimingRules()` returns:
```
For each segment:
  lastWord = segment.words[segment.words.length - 1]
  if lastWord.end < segment.endSec:
    segment.words[segment.words.length - 1] = {...lastWord, end: segment.endSec}
```
Ensures the karaoke highlight stays active through the segment's linger period.

### 4c. Word Gap Fill Within Segments
Already partially addressed by Phase 1 Pass 3 (micro-gap fill on raw words). This step handles any remaining gaps created by segmentation timing adjustments:
```
For each segment, for each word[i] where i < words.length - 1:
  if word[i+1].start - word[i].end < 0.15:
    word[i] = {...word[i], end: word[i+1].start}
```

---

## Constants Summary

| Constant | Value | Source | Location |
|----------|-------|--------|----------|
| `MIN_WORD_DURATION` | 0.05s (50ms) | CrisperWhisper | cleanWordTimestamps.js |
| `MICRO_GAP_THRESHOLD` | 0.15s (150ms) | stable-ts | cleanWordTimestamps.js |
| `TAIL_HOLD_DURATION` | 1.5s | Existing | shared findActiveWord |
| `PRE_WORD_LOOKAHEAD` | 0.15s | Existing | shared findActiveWord |
| `LINGER_DURATION` | 0.4s | Existing | segmentWords.js Phase 3 |
| `MIN_DISPLAY_DURATION` | 0.3s | Existing | segmentWords.js Phase 3 |

---

## Integration Points

### Where cleanWordTimestamps Gets Called

1. **`useSubtitleStore.initSegments()`** — before passing words to `segmentWords()`. The `allWords` array (line ~960) gets cleaned first.
2. **`useSubtitleStore.setSegmentMode()`** — same, the `allWords` array gets cleaned before re-segmentation.
3. **AI pipeline** (if words come from whisper.cpp directly) — clean at ingestion time so all downstream consumers benefit.

### Files Modified

| File | Phase | Changes |
|------|-------|---------|
| `src/renderer/editor/utils/cleanWordTimestamps.js` | 1 | NEW — 3-pass post-processor |
| `src/renderer/editor/utils/segmentWords.js` | 4 | startSec clamp, last-word extension, in-segment gap fill |
| `src/renderer/editor/components/PreviewOverlays.js` | 2, 3 | Progressive highlight, extract shared algorithm |
| `public/subtitle-overlay/overlay-renderer.js` | 2, 3 | Progressive highlight, shared algorithm, add syncOffset |
| `src/renderer/editor/stores/useSubtitleStore.js` | 1 | Call cleanWordTimestamps before segmentWords |
| `src/renderer/editor/utils/segmentWords.test.js` | 4 | New test cases |

### Files NOT Modified
- `useEditorStore.js` — no changes (save/load already works after earlier fix)
- `useCaptionStore.js` — no changes
- `useLayoutStore.js` — no changes
- `usePlaybackStore.js` — no changes (rAF loop is fine)

---

## Testing Checklist

### Unit Tests (segmentWords.test.js)
- [ ] Words with 0ms duration get extended to 50ms
- [ ] Overlapping word timestamps get midpoint-averaged
- [ ] Gaps <150ms between words get filled
- [ ] Gaps >150ms between words are preserved
- [ ] Segment startSec never precedes first word's start
- [ ] Last word.end equals segment.endSec
- [ ] 1word mode: gap fill is no-op, last-word extension applies
- [ ] cleanWordTimestamps is idempotent

### Visual Tests (manual)
- [ ] Open clip_1773883452956_geog in editor, verify no drift at "as always"
- [ ] Karaoke highlight sweeps progressively (not instant color change)
- [ ] Switch to Projects tab and back — styles persist (regression check)
- [ ] Export/burn-in matches preview exactly (syncOffset applied)
- [ ] Adjust syncOffset in editor — verify burn-in respects it
- [ ] Long clip (2+ minutes) — no cumulative drift

### Edge Cases
- [ ] Clip with no word timestamps (fallback: segment-level display only)
- [ ] Single-word segments display correctly
- [ ] Very fast speech (many words < 100ms apart)
- [ ] Long pauses (3+ seconds) — no phantom highlights during silence
- [ ] Filler words ("um", "uh") with weird Whisper timing

---

## Execution Order

```
Phase 1 (cleanWordTimestamps.js) — do first, biggest impact
Phase 4 (segmentation safe fixes) — do second, builds on Phase 1
Phase 3 (unify preview/burn-in) — do third, prerequisite for Phase 2
Phase 2 (progressive karaoke) — do last, rendering change on top of unified algorithm
```

Each phase is independently shippable and testable. Don't merge phases.

---

## Research Sources

- whisper-timestamped v1.15.9: `ensure_increasing_positions()` — monotonicity enforcement
- stable-ts v2.0.0: `suppress_silence()`, `min_word_dur=0.1`, `merge_gap=0.15`
- CrisperWhisper (arxiv 2408.16589): 50ms min duration, 160ms gap cap
- WhisperX v3.8.5: forced alignment via wav2vec2 (too heavy for us, but validates the approach)
- Aegisub: `\kf` progressive fill karaoke standard
- Netflix: 40-80ms sync tolerance
- Whisper internal aligner paper (arxiv 2509.09987): DTW attention-based alignment limitations
