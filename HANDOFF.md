# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Video Splitting Phase 2 complete + UX fixes)_

## Current State
App builds and launches cleanly. Video splitting Phase 1 (auto-split + drag-and-drop) and Phase 2 (game-switch scrubber) are both **complete** — all 14 steps implemented. Two UX fixes applied post-implementation.

## What Was Just Built

### Video Splitting Phase 2 — Steps 11-14
- **Thumbnail generation** (`ffmpeg.js`) — `generateThumbnailStrip()` extracts one frame every 30s at 320px wide, stored in OS temp dir. `cleanupThumbnailStrip()` deletes temp dir.
- **Thumbnail IPC endpoints** (`main.js`, `preload.js`) — `thumbs:generate` with in-memory cache by filePath, `thumbs:cleanup` removes cache + temp dir. All cached dirs cleaned on `window-all-closed`.
- **ThumbnailScrubber component** (new `components/ThumbnailScrubber.js`) — scrollable thumbnail strip, click-to-place purple markers, per-segment game dropdowns (grouped Select + GamePill), 1-min minimum segments, loading state.
- **Game-switch integration in RenameView** — "split by game" text link in action buttons row, expands scrubber below card. `gameSwitchSplitAndRename()` handles compound splitting (game-switch then auto-split per segment). Both `renameOne` and `renameAll` support game-switch path.

### UX Fixes (post-implementation)
- **Quick Import dropdown** — replaced native `<select>` in Recordings tab modal with styled `Select` component matching Rename tab (GamePill tags, colors, dark theme)
- **"Multiple games" button** — renamed to "split by game", moved from confusing standalone button to subtle muted text link in the action buttons row (next to RENAME/HIDE)
- **Scrubber loading fix** — moved `setScrubberLoading` clear into `finally` block so it always clears even on error
- **Thumbnail logging** — added `(thumbs)` scope logging in main process for debugging generation issues
- **Database re-migration** — reset `fileMigrationComplete` flag to repopulate empty `file_metadata` table (DB had been recreated after previous migration)

## Key Decisions
- Thumbnail cache is in-memory (`thumbnailCache` Map) — no persistence needed since thumbs are temp files
- Compound splitting builds one flat `allSplitPoints` array and sends to `split:execute` in one call (simpler than nested split calls)
- "split by game" as a subtle text link rather than a button — most files don't need this, so it shouldn't dominate the UI
- Quick Import dropdown uses the same `Select` + `GamePill` pattern as Rename tab — visual consistency across the app

## Next Steps
1. **Test game-switch scrubber end-to-end** — click "split by game" on a pending file, verify thumbnails generate, place markers, assign games, split & rename
2. **Investigate thumbnail generation hang** — "Preparing preview..." was stuck during initial testing. Logging added but root cause not confirmed (may be FFmpeg timeout on large files, or file path issue)
3. **`splitSourceRetention: "delete"`** — not yet wired. Source files always kept after split.
4. **Legacy feature removal** — OBS log parser + voice modes still in `tasks/todo.md`
5. **Instagram/Facebook login flow split** — paused, plan exists

## Watch Out For
- **Thumbnail generation not yet verified working** — "Preparing preview..." was stuck during testing. Debug logging added (`(thumbs)` scope in app logs, `[Scrubber]` in DevTools console). Next session should test with a real file and check logs.
- `splitSourceRetention: "delete"` not implemented — source files always kept
- Quick-import on Recordings tab starts pipeline immediately — many splits = many queued files
- The `pendingImports` Set iterates all entries (O(n)) — fine for small sets
- 2 unmigrated files (OoA, CHS) — no matching Game Library entries
- DB was re-migrated this session (105 files repopulated) — if DB gets recreated again, same issue will recur

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow/clipflow-settings.json`
- Database file: `data/clipflow.db` (schema v3, 105 file_metadata rows)
- Thumbnail temp dir: `%TEMP%/clipflow-thumbs/` (cleaned up on app quit)
- Thumbnail debug: check `(thumbs)` scope in app logs + `[Scrubber]` in DevTools console
