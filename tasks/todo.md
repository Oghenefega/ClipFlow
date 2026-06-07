# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## Active plan — Recordings tab: two-line cards so filenames are readable

**Problem.** On the Recordings tab each recording is a single horizontal row where the
filename (`flex:1`) competes with 5 fixed-size elements (checkbox, game-tag pill, TEST
chip, size, status badge). At ~7 columns (`PILL_MIN = 200`) each card is only ~200px, so
the name gets ~6–8 chars → "AR Da…". Fega can't tell Day 17 from Day 20. Approved
direction (session 64): **two-line cards**. Scoped precursor to the larger Recordings
redesign (which stays a separate conversation).

**File impact:** `src/renderer/views/UploadView.js` ONLY. No store / IPC / data / migration.
- `PILL_MIN` (line 87): 200 → ~270 (≈5 columns).
- Card render block (~1140–1240): restructure to `[checkbox] + [column: name line / metadata line]`.

**Layout.**
- Card: row, add `borderLeft: 3px solid <gameColor>` — the colored bar now IDs the game
  (replacing the tag pill's color job).
  - Checkbox — unchanged, `flexShrink:0`.
  - Inner column (`flex:1; minWidth:0`):
    - **Line 1 — filename** (hero): fontSize 13, weight 600, up to 2 lines
      (`-webkit-line-clamp:2`), `title={full original filename}` for hover.
    - **Line 2 — metadata** (muted, ~10px): size · TEST chip · status badge
      (✓clips / DONE-× / progress%). Drop the redundant "AR" text pill (name already
      starts with the tag; left color bar carries the game ID).
- Preserve ALL existing behavior: card `onClick` toggles selection; TestChip + DONE/reset
  "×" keep their `stopPropagation`; done / generating / selected styling unchanged.

**Steps.** (1) bump PILL_MIN→270; (2) restructure card JSX into checkbox + 2-line column,
move TEST/size/status to line 2, add left color border; (3) add `title` (full
`current_filename`) on the name; (4) `npm run build:renderer` + relaunch + visual check.

**Verification (Fega, plain).** Open Recordings → names read on their own line, long names
wrap/show fully; game color still visible as a left bar; TEST toggle, DONE ×, size, ✓clip
count all still present + working; hover a name shows the full original filename; ~5
columns; clicking a card still selects it.

**Out of scope (next conversation):** the larger Recordings redesign — filters, sort,
search, thumbnails, bulk actions, overall layout.

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
