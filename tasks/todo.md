# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## ACTIVE PLAN

_None._ Session 77 cleared the karaoke fragile zone (9 closes, see SHIPPED) — all
`status: untested` pending Fega's generated-clip checklist. Next: verify session-77
fixes in-app, then #135 (caption corner handles), #99 (caption bleed), the #68→#62
pipeline pair, or #137/#138 (new, filed session 77). Run the start-session ritual.

---

## SHIPPED — recent (closed)
- **Session 77 karaoke fragile-zone sweep** (all closed `status: untested`, one commit each):
  **#136** word-delete words/text desync (`5befa4c`); **#89** mode-switch edit loss (`0e55482`);
  **#131** srcWordIdx highlight/seek desync (`af2f15d`); **#132** mid-playback click freeze
  (`861d9fe`); **#95** split word dup/drop (`afb70f5`); **#87** tight-gap overlap (`16f8ae5`);
  **#90** stale clip-load playhead (`6c3eb84`); **#88** initVideoRef set() (`af0939f`); **#107**
  resolved-by #131/#95. Filed **#137** (timeline split time-space) + **#138** (AA toggle vs words[]).
- **Session 74 fix-first batch** (all closed `status: untested`): **#124** waveform/ffmpeg logs → `app.log` (`759e7a2`); **#92** "Applied" badge gated on confirmed save (`1fc5964`); **#101** punctuationRemove restored on reopen, **#32** caption-width restored on reopen, **#106** passive-wheel console warning killed across 3 handlers (`a197bc3`). Parked #68/#62; recorded the `tools/`-bundling scope correction on #68.
- **#57** Editor 30-min lag (60fps re-render storm) — **CLOSED** (D1 `c74c30e` timeline + D2 `985fa12` subtitle list). Both per-frame storms isolated into tiny memoized children (`TimelinePlayhead`, `SegmentRow`); Fega-confirmed smooth. Phase D3 (row self-subscribes to `currentTime` so the parent can drop its sub) was the conditional fallback — not needed.
- **#129** ALL-CAPS (AA) no-op on uncased text — fixed (`507347a`, session 72). Surfaced by the D2 fresh-eyes review.
- **#130** Stale "Long segment" warning after timecode/split/merge — fixed (`507347a`, session 72). Surfaced by the D2 fresh-eyes review.
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
