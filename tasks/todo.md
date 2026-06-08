# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## Active plan — Recordings card redesign (Option A) → tracked as #122

**Status:** designed & approved (session 65); **BUILD NEXT SESSION.** The two-line plan that
was here is DEAD (built, rejected for dead space, reverted). Full spec lives in **#122** and in
the interactive prototype `mockups/recordings-cards.html` (open in a browser — the top grid IS
the spec). Short version below.

**Problem.** At ~7 cols (`PILL_MIN=200`) the filename (`flex:1`+ellipsis) competes with
checkbox + AR pill + TEST + size + DONE and truncates to "AR Da…".

**Approved design (Option A) — single line, ~5 cols, NO left colour bar.** `UploadView.js` only
(+ a saved setting for the tag mode):
1. **Drop the left `<Checkbox>`** — selection shown by the card HIGHLIGHT (purple); frees ~22px,
   removes the redundant two-checkmarks. Card `onClick` already toggles selection.
2. **Tag full `AR` pill ↔ minimized slim `|` line** via a header quick-toggle; default full;
   persist as a setting (inspect settings plumbing first; if heavy, `useState` default-full then
   follow up).
3. **Drop the visible size**; keep it on the card `title` (full filename + size) for hover.
4. **DONE badge → bare green ✓**; click → red ✕ → un-mark (per-card armed state). Replaces both
   `manualDone`/`unmarkDone` and `f.status==="done"`/`resetFileDone`.
5. **Keep** TEST chip (+`stopPropagation`), `✓ N` clips badge, generating `%`, name
   `flex:1`+ellipsis+`title`.

**Verify.** `npm run build:renderer` → relaunch → Fega check at ~5 cols; tag toggle persists;
✓→✕→un-mark on both done paths; selection + generate-count still work.

**Out of scope (separate):** the larger Recordings redesign — filters, sort, search, thumbnails,
bulk actions, overall layout.

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
