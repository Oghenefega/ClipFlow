# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## SESSION 62 — #117 DONE ✅ (Fega-verified) → plan for #118 + #119, AWAITING APPROVAL

#117 shipped & closed (subtitle resize keeps all words; commit `acab20c`). While testing it,
Fega surfaced two related per-word-timing items. Plan below covers both. **No code until Fega
approves.** Sequencing: #118 first (small, ~1 file), ship + verify, then #119 as its own pass.

### #118 — extend left edge leaves a dead zone (first word un-highlighted until its original start) — BUG, quick fix

**Root cause:** `updateSegmentTimes` (`useSubtitleStore.js`, `durChanged` branch) clamps words to
the new bounds (`start: Math.max(w.start, startSec)`, `end: Math.min(w.end, endSec)`). On a LEFT
extend, `startSec` shrinks but the first word's `start` stays at its old (later) value → gap
between block start and first word start = inert dead zone. `move` shifts all words by delta, so
it's fine. Pre-existing — #117 only touched the trim word-drop path.

**Fix (1 file):** after the `durChanged` re-time in `updateSegmentTimes`, pin the outer words to
the block edges (interior words keep real audio-synced timing):
- `updatedWords[0].start = startSec`
- `updatedWords[last].end = endSec`

Applies on both extend and trim → never a dead zone at either end.

**File impact:** `src/renderer/editor/stores/useSubtitleStore.js` (durChanged branch only).

**Verify:** synthetic harness (extend left → `words[0].start === startSec`; extend right →
`words[last].end === endSec`; interior timings unchanged; no word dropped; `words` in sync with
`text`) + `npm run build:renderer` + Fega: extend a sub's left edge earlier → first word
highlights from the new start, no dead zone; extend right edge → last word holds to block end.

### #119 — per-word "teeth" on timeline subtitle blocks — FEATURE

**Goal:** a small draggable marker at each *internal* word boundary on the **selected** subtitle
block; drag left/right to set where one word ends and the next begins (= when the next word's
highlight fires). Also a live visual of word boundaries. Data already exists (`seg.words[]`
start/end) → UI layer + one store action, **no data-model / pipeline change.**

**Steps / file impact:**
1. **Store action** `setWordBoundary(segId, boundaryIdx, sourceTimeSec)` in `useSubtitleStore.js`:
   `_pushUndo()`; set `words[i].end = words[i+1].start = clamp(t, words[i-1].end + MIN, words[i+1].end − MIN)`.
   `text` unaffected (only timings move) → invariant preserved automatically.
2. **`SegmentBlock.js`** (`components/timeline/`): when `selected`, render a draggable tick at each
   internal word boundary (top strip). Pointer-drag mirrors the existing `onHandleDown` pattern;
   call up a new `onWordBoundaryDrag` prop. **Add `seg.words` to the `React.memo` comparator**
   (currently omitted → teeth wouldn't re-render on edit).
3. **`TimelinePanelNew.js`**: `handleWordBoundaryDrag(segId, boundaryIdx, timelineXSec)` → map
   timeline→source → `setWordBoundary`. Pass `onWordBoundaryDrag` down to `SegmentBlock`.
4. **Coordinate mapping:** `words[]` are source-absolute; `SegmentBlock` receives timeline-mapped
   segments (`getTimelineMappedSegments`). Map each `words[i].end` source→timeline for the tooth
   x-position; map drag delta timeline→source for the action. Reuse `sourceToTimeline` /
   `timelineToSource` from `models/timeMapping`.

**Risks:** tooth hit-areas must not collide with the block's body-drag / edge-resize handlers
(distinct top strip); crowding on fast speech (~0.2s words) → mitigated by selected-only + zoom.

**Verify:** `setWordBoundary` harness (clamp between neighbors + MIN; `text`/`words` stay in sync;
undo restores) + build + Fega: select a sub, drag a tooth → the following word highlights
earlier/later in BOTH the preview and the burned-in export; teeth can't cross neighbors or block
edges; undo works.

---

## Deferred plans

### #85 Chunk B/D — title/caption clip-signal forwarding (was active session 45)
Plan to forward `energyLevel` + `confidence` into the title/caption prompt
(`useAIStore._collectClipParams` → `title-caption-prompt.js buildUserContent` →
`main.js anthropic:generate`). Chunk D (wire full `creatorProfile`) is
**deliberately deferred** — profile is detection-only by design; feeding
`archetype` into wording re-introduces the generic template-y copy session 42
removed. Full body recoverable from `git log -p tasks/todo.md`. Re-introduce when
returning to #85.

### Interactive architecture/flows visualizer
A previous session drafted a single-page HTML architecture visualizer for the
Obsidian vault (`context/architecture/`) using vis-network 9.x. Never approved or
started. Body recoverable from git history. Re-introduce when there's appetite for
a docs-quality artifact.
