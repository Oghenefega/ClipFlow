# ClipFlow — Session Handoff
_Last updated: 2026-07-11 — Session 99 — **Recordings tab "Group by: Month / Game" toggle, shipped + verified in-app (`17037ef`), rides the next installer.**_

---

## One-line TL;DR
Added a "Group: Month | Game" segmented toggle to the Recordings tab (`17037ef`) — folders can now be keyed by game instead of month, alphabetical by game name, mode persisted across restarts. Verified live via computer-use in the source-run app. Single-file change (UploadView.js). Toggle only — Fega explicitly declined a game filter for now.

## Current State
- **Installed daily driver: 0.1.8-alpha.13; alpha.14 installer still cut and waiting in `dist/`** — Fega hasn't reinstalled yet (carried from session 98). The group-by toggle is NOT in alpha.14; it rides the NEXT installer cut.
- Group-by toggle fully verified in the source-run app (both modes, expand/collapse, persistence). Store left on "month" (the default) after testing.
- Session 98's Queue pencil/propagation remains the one unverified alpha.14 piece (needs his real queued clip on the installed app).
- Working tree: usual never-commit `data/` pair + untracked `tasks/mocks/` scratch.

## What Was Just Built
- **"Group by: Month / Game" toggle (`17037ef`)** — all in [src/renderer/views/UploadView.js](src/renderer/views/UploadView.js):
  - `groupMode` state ("month" | "game", default "month"), persisted to electron-store key `recordingsGroupMode`, loaded in the existing settings effect, saved via `changeGroupMode` (mirrors `changeTagMode`).
  - Grouping bucket key branches on mode: game mode uses `f.tag || "unknown"`; test files keep their own "test" folder in both modes. Folder sort: "test" first, "unknown" ("Other") last, games alphabetical by display name via `findGameByTag(tag, gamesDb)?.name`.
  - New top-level `folderLabel(key, groupMode, gamesDb)` helper next to `monthLabel`; header render swapped to it.
  - Toggle UI copies the #122 Tags segmented-control pattern exactly, placed left of it.
  - Collapse/expand, per-folder Select All, done/selected counts all reuse the generic folder-key logic untouched — game tags can't collide with "YYYY-MM"/"test"/"unknown" keys.
- Implementation delegated to a Sonnet subagent (per the Fable delegation pattern); diff reviewed in main session, 56 insertions / 5 deletions, one file.

## Key Decisions
- **Toggle only, no game filter.** I offered a "filter to one game, keep month folders" alternative; Fega chose the toggle. A filter can layer on later if wanted.
- **Month stays the default** — no behavior change for existing muscle memory.
- **Alphabetical by game display name** (not tag) in game mode; files inside folders keep the #126 chronological sort.
- **Collapse state is shared per-key across modes** (one `recordingsCollapsed` object). Pre-existing game-tag keys in Fega's settings mean some game folders start collapsed on first switch — explained to Fega, accepted, not a bug.

## Next Steps (prioritized)
1. **Fega reinstalls alpha.14** (still pending from session 98) → then verifies the queue title pencil/caption propagation on his real queued clip.
2. **Next installer cut** picks up the group-by toggle for the daily driver (batch rule: ~10 changes or explicit "update the launcher").
3. **#162** — undo of a segment-mode switch restores segments but not the mode dropdown label (small, cosmetic).
4. Carried: Tracker Phase 1 closeout check (first REAL publish through the Queue), #161 (Sundays product decision).

## Watch Out For
- **`recordingsGroupMode` store key is live** — only "month"/"game" are accepted on load; anything else falls back to month.
- **Game-mode "unknown" folder** only appears if a recording has no tag; current data has none, so it's untested visually (logic is the same shared path as month mode's "unknown").
- Carried from session 98: TranscriptTab depends on live editSegments + `_chunkPending` fallback; `editingWordKey` is live plumbing; split eligibility computed at menu-open; queue propagation rewrites exact old-title matches only.

## Logs/Debugging
- No new error patterns this session. Renderer build clean (`npm run build:renderer`, 11.5s); app launched clean on the prod profile (`npm start`, schema v4, no migration).
- Verification via computer-use on the source-run app ("electron.exe" grant). Only UI state touched during testing was the group toggle (left on "month") and one folder expand (`AR: false` in `recordingsCollapsed`) — both cosmetic, persisted in `%APPDATA%\clipflow\clipflow-settings.json`, no data changes.
- Reminder: electron-store lives at `%APPDATA%\clipflow\clipflow-settings.json` (NOT `config.json`) — useful for checking persisted UI state.
