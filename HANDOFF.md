# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Video Splitting Phase 1, steps 1-10 complete)_

## Current State
App builds and launches cleanly. Video splitting Phase 1 is **complete** — all 10 steps implemented. Phase 2 (game-switch scrubber, steps 11-14) remains for a future session.

## What Was Just Built

### Video Splitting Phase 1 — Steps 5-10

**Step 5 — `importExternalFile` IPC + `pendingImports` Set**
- `import:externalFile` handler copies .mp4 to watch folder's monthly subfolder with streaming progress events
- `pendingImports` Set in main process stores `{filename, sizeBytes}` entries
- `import:clearSuppression` and `import:cancel` IPC endpoints for cleanup
- Bridge methods in preload.js: `importExternalFile`, `importClearSuppression`, `importCancel`, `onImportProgress`

**Step 6 — File watcher suppression**
- Chokidar `add` handler checks `pendingImports` before processing (filename + size match per spec v3.1)
- Prevents duplicate `file_metadata` records during drag-and-drop imports

**Step 7 — Auto-split integration in Rename tab**
- Probes duration via `ffmpegProbe` when files enter pending
- Split badge: "2h 14m — will split into 5 parts" with purple accent styling
- Split preview panel showing Pt1-PtN with time ranges
- Per-file "Don't split" / "Enable split" toggle
- RENAME button becomes "SPLIT & RENAME" for split files
- `splitAndRename()` function: creates parent metadata → executes split → renames children via preset engine
- Split progress indicator: "Splitting file... (3 of 5 parts done)"
- `renameAll` also handles splits transparently

**Step 8 — Drag-and-drop on Rename tab**
- Drop zone overlay (dashed purple border, "Drop recording here")
- Accepts .mp4 only, single file, shows toast for invalid drops
- Copies to watch folder with suppression → adds to pending manually
- Import progress bar for large files
- Empty state updated: "Or drag and drop an .mp4 file here"

**Step 9 — Drag-and-drop on Recordings tab + quick-import modal**
- Same drop zone treatment with "Drop recording to generate clips"
- Quick-import modal with 3-step flow:
  1. Pick game/content (required)
  2. Split proposal — green "Split into N parts" primary, gray "Process as single file" secondary
  3. Preview + "Generate Clips" confirm
- Uses preset 3 (Tag + Date) automatically
- Prompts for watch folder if not configured
- On confirm: creates metadata, splits if needed, renames, starts pipeline

**Step 10 — Rename history for splits**
- Already logged by step 4's `split:execute` handler (action="split", childIds in metadata_snapshot)
- Added SPLIT badge (purple) in History tab for split entries
- No UNDO button for split entries (deferred per spec)

## Key Decisions
- **2-minute minimum tail segment** — files barely over the threshold (e.g. 30:04 at 30-min threshold) don't split. The last segment must be >= 2 minutes, otherwise the file is treated as a single recording. Prevents useless micro-segments.
- `pendingImports` is an in-memory Set — if ClipFlow crashes mid-import, watcher picks up file normally (acceptable)
- Quick-import modal uses native `<select>` for game picker (lightweight, no custom dropdown needed in modal)
- Split progress updates per-segment via `setSplitProgress` state
- `renameSingleFile` and `splitAndRename` extracted as reusable helpers from `renameOne`
- Import progress uses streaming `fs.createReadStream` → `fs.createWriteStream` with `data` event counting

## Next Steps
Phase 2 (game-switch scrubber): steps 11-14
11. Thumbnail generation — FFmpeg strip pipeline, temp storage, caching
12. `generateThumbnails` / `cleanupThumbnails` IPC endpoints
13. Scrubber UI — read-only thumbnail strip, click-to-place markers, per-segment game dropdown
14. "Multiple games" button in Rename tab, compound splitting

**Spec:** `C:\Users\IAmAbsolute\Desktop\ClipFlow stuff\video-splitting-spec-v3.md` (v3.1)

## Watch Out For
- `splitSourceRetention: "delete"` is not yet implemented — source files are always kept after split. Add deletion in a future pass if the setting is "delete" and split succeeds.
- Quick-import on Recordings tab starts pipeline immediately — if multiple splits produce many files, they'll queue up. Only one pipeline runs at a time (no parallel processing).
- The `pendingImports` Set comparison iterates all entries (O(n)) — fine for the expected small set, but don't let it grow unbounded if imports never clear.
- 2 unmigrated files from rename redesign (`OoA Day1 Pt1` and `CHS Day1 Pt1`) still have no matching Game Library entries
- Legacy feature removal (OBS log parser + voice modes) is still in `tasks/todo.md` but not yet started

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow-settings/clipflow-settings.json`
- Database file: `data/clipflow.db` (schema v3, 105 file_metadata rows)
- Migration logs: look for `(database)` scope — "Running migration v3" confirms split columns added
