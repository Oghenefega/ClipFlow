# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## No active plan — #122 shipped (session 66)

**#122 (Recordings card redesign, Option A) is BUILT, verified by Fega, and closed (session 66).**
Single-line cards, selection-by-highlight (no left checkbox), game-tag full/min header toggle
(persisted via `recordingsTagMode`), size moved to a custom dark hover tooltip (~0.5s delay,
below the card), and done = green ✓ → red ✕ → un-mark (replaces both the manual-done and
`status="done"` paths). Built from `mockups/recordings-cards.html`; see CHANGELOG (2026-06-08).

### Next candidates (pick at session start)
- **Larger Recordings redesign** (separate from #122) — filters, sort, search, thumbnails, bulk
  actions, overall layout. Recordings is still V1 beyond the card itself.
- **Subtitle `words[]`/`text` family** (deferred): #95, #107, #87, #101, #89, #84.
- **#121** (chore) — `originalSegments` "sentence-level" comment clarification; low priority.
- Backlog: #64 (waveform empty), #112/#62 (EPIPE / silent audio), #57 (editor lag), #114/#108/#40.
  Commercial-launch: #20–#23, #50–#56, #73/#74, #85.

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
