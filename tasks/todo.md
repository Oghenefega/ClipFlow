# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## No active plan

**Session 48 outcome (#103):** Investigated the "trim collapses spliced clips" bug.
Traced the code, then verified in the running app — **it does not reproduce.** The
live timeline trims per-segment via `WaveformTrack` → `trimNleSegmentLeft/Right`,
which is already gap-preserving. The bug #103 cited lives only in `commitAudioResize`,
a dead path with zero callers. **#103 closed as not-reproducible.**

Spun out:
- **#104** (chore) — remove the dead single-block audio-resize path (`commitAudioResize`,
  `commitLeftExtend`, `_recutAfterDelete`, `revertClipBoundaries`, `deleteAudioSegment`,
  `clip:recut` IPC). Could fold into #40.
- **#105** (improvement) — audio over-trim leaves a ~0.1s sliver; needs a design call
  (auto-remove like subtitles vs keep the floor) + unify the duplicate
  `MIN_SEGMENT_DURATION` constants (0.05 vs 0.1).
- Flagged closed #102 / #97 — they patched the dead `commitAudioResize` path.

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
