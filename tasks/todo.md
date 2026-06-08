# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## ACTIVE PLAN — Recordings floating action cluster + batch generate (session 67)

**Goal:** Make Generate / Mark-as-Done reachable without scrolling to the bottom of the list, and
make Generate process ALL selected recordings sequentially (Fega wants to batch-generate for daily
posting). Design = Option C (bottom-right corner cluster) from `mockups/recordings-action-bar.html`,
approved by Fega. Wording "Generate X Clips"; no Clear button.

**File impact:** `src/renderer/views/UploadView.js` only (+ CHANGELOG at end).

**Steps:**
1. Replace the inline "Footer actions" block (~:1306–1338) with a `position:fixed` bottom-right
   cluster: count pill ("N selected") + `✓ Mark Done` + `Generate N Clips`. Subtle slide-up
   (inline `<style>` keyframe, per ThumbnailScrubber pattern). `bottom:72` clears the 56px nav.
   Add a conditional bottom spacer (~90px) so the last card row clears the cluster when scrolled down.
2. Extract `runOnePipeline(file)` from `handleGenerate` — the current single-file body made cleanly
   awaitable (no `if (generating) return` guard, no setTimeout auto-clear; returns `{ok, clipCount, error}`).
   Keep `handleGenerate(file)` working for the quick-import auto-generate path (:634).
3. Add `handleGenerateBatch(files)`: `for … of` loop, `await runOnePipeline(f)` per file; set a
   "N of M" batch indicator each iteration; live per-file progress keeps flowing via the existing
   `onPipelineProgress` listener (:219). Continue on error, collect failures.
4. Wire the cluster's Generate button → `handleGenerateBatch(selectedFiles)`.
5. On batch completion: refresh file list once, clear selection (`setSelected({})`), show a one-line
   summary (e.g. "Generated 10 of 11 — 1 failed"). Defer profile-update modal(s) to after the batch.

**Proposed defaults (flagged for Fega):**
- Mid-batch error → CONTINUE with the rest, report failures at the end (don't abort the whole run).
- After batch → auto-clear the selection (those recordings are now generated).
- Play-style update prompt → surface after the batch finishes, not between files (no modal spam).

**Verify:** build clean + `npm start`; select 2–3 short TEST recordings → Generate → they run one
after another with "N of M" + per-file progress → all become projects → selection clears → summary.
Select 1 → still works. Quick-import auto-generate (:634) still works. No single-generate regression.

**Watch out:** don't break quick-import auto-generate; `generating` must be set per current file and
cleared only at the very end; `runOnePipeline` must be a stable awaitable (no stale-closure on the
`generating` guard).

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
