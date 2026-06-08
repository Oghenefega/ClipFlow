# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## SHIPPED — Recordings floating action cluster + batch generate (#123, session 68)

Done and pushed (`e9a039d`), issue #123 closed. Option C bottom-right cluster (`✓ Mark Done` + `Clip N
Recordings`, no count pill, no icon); Generate now batches ALL selected recordings sequentially
(`Clipping recording N of M` → `Clipped N of M`, continues past failures, deferred play-style queue);
wording corrected to "Clip Recordings" page-wide. `runOnePipeline` extracted from `handleGenerate`
(quick-import path preserved). Verified visually by Fega; only the real-clip sequential run is left as
an optional bonus regression check. All in `src/renderer/views/UploadView.js`.

### Backlog candidates
- **Larger Recordings redesign** — filters, sort, search, thumbnails, overall layout (V1 beyond the card).
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
