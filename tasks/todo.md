# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## ACTIVE PLAN — #57 editor lag on 30min+ source (60fps re-render storm), session 71

**Root cause (verified in current code):** during playback with the timeline visible,
three large components re-render ~60×/sec: the whole `TimelinePanelNew` (~1500 lines, twice
per frame — once from its `currentTime` sub at :36, once from its own `smoothTime` rAF at
:94/:130), the open left-panel tab (all 100–200 rows, `LeftPanelNew.js:642`/`:390`), and
`PreviewPanelNew`. On a 30-min source each reconcile is huge → choppy playback, laggy zoom
slider, out-of-sync highlight. Factors #1/#2 (DevTools gate, DBG logs) already fixed (Phase A);
factor #4 (waveform stuck) fixed via #64 last session. Remaining = factor #3, the fan-out.

**Strategy:** don't touch highlighting logic (that's what reverted Phase B/C). Instead isolate
the per-frame part into tiny children so only they re-render at 60fps, not the heavy parents.
One change per commit; verify between.

### Phase D1 — Timeline playhead extraction (SAFER) — DONE (`c74c30e`, session 71)
New file `src/renderer/editor/components/timeline/TimelinePlayhead.js` exporting:
- `<TimelinePlayhead>` — owns `smoothTime` state + rAF loop + paused-sync + auto-scroll +
  playhead JSX. Subscribes to `playing`/`currentTime` itself; takes `effectiveDuration`,
  `clipContentWidth`, `scrollRef` as props.
- `<TimelineTimecode>` — subscribes to `currentTime`, renders the toolbar clock readout.

Edits to `TimelinePanelNew.js` (drop all 60fps subs from the parent):
1. import the two new components
2. remove `currentTime` sub (:36)
3. remove `playheadRafRef` + `smoothTime` useState (:93–94)
4. remove rAF loop + paused-sync effects (:125–152)
5. remove `playheadTime`/`playheadPx` derivation (:177–178)
6. zoom-anchor effect: read `getState().currentTime`, drop `currentTime` from deps (:729/:746)
7. remove auto-scroll effect (:748–762)
8. timecode span → `<TimelineTimecode/>` (:829)
9. playhead JSX block → `<TimelinePlayhead .../>` (:896–916)
10. drop dead `currentTime={currentTime}` prop on WaveformTrack (:1088)

**Verify (D1):** build:renderer clean → npm start launches → playhead moves during playback,
scrubbing/seek snap it correctly, auto-scroll-during-playback works, zoom slider still anchors,
toolbar clock ticks, highlighting untouched. Then Fega: 30-min source feels smoother / no judder.

### Phase D2 — SegmentRow memo extraction in EditSubtitlesTab (RISKIER, separate commit) — session 72, PLAN
**Why it's the storm:** `EditSubtitlesTab` subscribes to `currentTime` (:642) → re-renders ~60×/sec
during playback. Its `editSegments.map` (:889–1016) re-runs ALL 100–200 rows each frame, each row
re-splitting text + re-mapping word spans (`renderWords`). But per frame, the only thing that
actually changes visually is the **active word inside the one playing segment** — every other row is
static between segment crossings (`getActiveWordInSeg` early-returns −1 outside the seg's bounds;
`activeSegId` is store state, written by an effect, changes only a few times per clip).

**Fix — extract + memoize, do NOT touch highlight DECISION logic** (that's the Phase B/C revert
class). New file `src/renderer/editor/components/leftpanel/SegmentRow.js`:
- `const SegmentRow = React.memo(forwardRef(function SegmentRow(props, ref){…}))`
- Move the row JSX (current :893–1014) + `renderWords` (:759–804) + the ALL-CAPS handler (:927–931)
  + delete handlers (:961, :973) **verbatim** into it. The `isHighlighted = isSelected ||
  isPlaybackActive` rule, the `getActiveWordInSeg` result, and `isActive` stay byte-for-byte; only
  their *location* changes and the values arrive as props.
- Event handlers inside the row call store actions via `getState()` (allowed in handlers, not render)
  and use the `seg` prop for data — so almost nothing needs to be threaded as a callback prop.

**Props (all referentially stable across frames → React.memo bails for inactive rows):**
`seg` (from the `getTimelineMappedSegments` useMemo — stable per-frame; recomputes only on
edit/nle change), `isActive` (bool), `activeWordInSeg` (number, parent computes `isActive ?
getActiveWordInSeg(seg) : -1`), `selectedWordIdx` (this seg's selected word or −1),
`anySelected` (`!!selectedWordInfo` — preserves the global "explicit selection suppresses playback
highlight everywhere" rule at :773), `editing` (this row's `editingWord` slice or null — stable obj
ref), `setEditingWord` (useState setter, stable). Forward `ref` only to the active row so the
parent's existing auto-scroll effect (:699) keeps working unchanged.

**Parent (`EditSubtitlesTab`) keeps:** `currentTime` sub, `getActiveWordInSeg`, the auto-track
effect (:687, writes `activeSegId`), the auto-scroll effect (:699), search, toolbar,
`editingWord` state + the toolbar "Add subtitle at playhead" which sets it (:835). Map body shrinks
to: compute the per-row primitives above, render `<SegmentRow .../>`. Per-frame cost drops from
~200 full row reconciles to 1.

**Verify (D2) — on a GENERATED clip with subtitles from Projects (source preview has NO transcript):**
active-word highlight tracks during playback in Edit Subtitles; segment auto-highlight + auto-scroll
still follow; ALL edit ops work — single-click-to-edit, double-click select-all, inline word edit,
delete (both menu items), TimecodePopover apply, ALL CAPS toggle, Add-at-playhead, split, merge,
segment-mode switch. THEN the 30-min source feel test (left panel no longer judders on playback).
Me = build + boot clean + 4-lens adversarial review (behavior-preservation / dangling-refs /
React-internals memo-correctness / completeness). Fega = in-app feel + edit-ops on a real clip.

### Phase D3 — Transcript tab word memo (CONDITIONAL — only if still laggy after D1+D2)
Same treatment for `TranscriptTab` word rows / visible-range chunking. No speculative work.

**Do NOT touch:** `SubtitleOverlay`/`LiveSubtitleOverlay` (acceptable cost); store-derivation
refactor (rejected in Phase B — wrong layer).

---

## SHIPPED — recent (closed)
- **#125** Recordings (i) info popover + Play-recording-in-editor — closed (`1d33a9d`, session 70).
- **#126** Recordings sort by part number, not rename-click time — shipped (`f2240e2`, session 70).
- **#123** Recordings floating action cluster + sequential batch generate — closed (`e9a039d`, session 68).

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
