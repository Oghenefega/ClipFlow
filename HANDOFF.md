# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Video Splitting Phase 2, steps 11-14 complete)_

## Current State
App builds and launches cleanly. Video splitting Phase 1 (auto-split + drag-and-drop) and Phase 2 (game-switch scrubber) are both **complete** — all 14 steps implemented.

## What Was Just Built

### Video Splitting Phase 2 — Steps 11-14

**Step 11 — Thumbnail generation FFmpeg function**
- `generateThumbnailStrip(inputPath, fileId)` in `src/main/ffmpeg.js` — extracts one frame every 30 seconds at 320px wide, stores in `os.tmpdir()/clipflow-thumbs/{fileId}/`
- `cleanupThumbnailStrip(thumbDir)` — `fs.rmSync` with recursive force
- Returns array of `{path, timestampSeconds}` plus total duration

**Step 12 — Thumbnail IPC endpoints**
- `thumbs:generate` handler with in-memory `thumbnailCache` Map keyed by filePath — reopening scrubber for same file reuses cached thumbnails
- `thumbs:cleanup` handler removes from cache and deletes temp dir
- All cached thumb dirs cleaned up on `window-all-closed`
- Bridge: `clipflow.generateThumbnails(filePath)`, `clipflow.cleanupThumbnails(filePath)`

**Step 13 — ThumbnailScrubber UI component**
- New component at `src/renderer/components/ThumbnailScrubber.js`
- Horizontal scrollable thumbnail strip with time labels every 5 min (10 min for >1h recordings)
- Click to place purple split markers (vertical line + circular handle + time tooltip)
- Click existing markers to remove
- Per-segment game/content dropdown (grouped, reuses shared Select + GamePill)
- 1-minute minimum segment enforcement
- Segment list below strip: numbered, time ranges, durations, game dropdowns, color indicators
- Loading state with animated sliding progress bar

**Step 14 — Game-switch split integration in Rename tab**
- "Multiple games" button on every pending file card (subtle, secondary styling)
- Toggles ThumbnailScrubber expansion below the card
- `gameSwitchSplitAndRename()` — creates parent metadata, builds split points from markers with per-segment tags, handles compound splitting (game-switch → auto-split per long segment)
- `renameOne` and `renameAll` both check for game-switch markers before auto-split
- RENAME button shows "SPLIT & RENAME" when markers are placed
- Scrubber state and thumbnails cleaned up on rename, cancel, hide, and rename-all
- State: `scrubberOpen`, `scrubberMarkers`, `scrubberThumbs`, `scrubberLoading` — all keyed by fileId

## Key Decisions
- Thumbnail cache is in-memory (`thumbnailCache` Map in main process) — simple, no persistence needed since thumbnails are temp files
- Scrubber uses `file://` protocol to load thumbnails from OS temp dir
- Compound splitting builds one flat `allSplitPoints` array with all segments (game-switch × auto-split) and sends it to `split:execute` in one call
- Game dropdown per segment uses `tag` values (not game names) for consistency with the rest of the system
- Thumbnail strip width = thumbnails.length × 64px per thumbnail (fixed width for predictable click-to-time mapping)

## Next Steps
- **Test game-switch splitting end-to-end** with a real multi-game recording
- **`splitSourceRetention: "delete"`** — not yet implemented. Source files are always kept after split. Wire up deletion in a future pass.
- **Legacy feature removal** — OBS log parser + voice modes still in `tasks/todo.md`, not yet started
- **Instagram/Facebook login flow split** — paused, plan exists in todo.md
- **Backend infrastructure** — Supabase, OAuth proxy, LemonSqueezy (GitHub issues #19-#25)

## Watch Out For
- `splitSourceRetention: "delete"` is not yet wired — source files always kept after split
- Quick-import on Recordings tab starts pipeline immediately — multiple splits produce many files that queue up
- Thumbnail generation timeout is 120 seconds — very long recordings on slow disks might time out
- The `pendingImports` Set comparison iterates all entries (O(n)) — fine for expected small set
- 2 unmigrated files from rename redesign (`OoA Day1 Pt1` and `CHS Day1 Pt1`) still have no matching Game Library entries

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow-settings/clipflow-settings.json`
- Database file: `data/clipflow.db` (schema v3, 105 file_metadata rows)
- Thumbnail temp dir: `%TEMP%/clipflow-thumbs/` (cleaned up on app quit)
