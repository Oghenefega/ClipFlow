# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Video Splitting Phase 1, steps 1-4)_

## Current State
App builds and launches cleanly. Video splitting Phase 1 steps 1-4 of 10 are **complete** (backend infrastructure). Steps 5-10 (import IPC, watcher suppression, Rename/Recordings tab UI, drag-and-drop) remain for next session.

## What Was Just Built

### Video Splitting Phase 1 — Backend Infrastructure

**Step 1 — Settings**
- Three new electron-store keys: `splitThresholdMinutes` (default 30), `autoSplitEnabled` (default true), `splitSourceRetention` (default "keep")
- Migration block for existing installs
- "Video Splitting" card in SettingsView with enable toggle, threshold slider (10-120 min), keep/delete originals toggle

**Step 2 — Schema Migration v3**
- 5 new columns on `file_metadata`: `split_from_id`, `split_timestamp_start`, `split_timestamp_end`, `is_split_source`, `import_source_path`
- Index `idx_file_split_from` on `split_from_id`
- `"split"` status handling across all affected queries:
  - `allRenamed` excludes `"split"` files
  - `updateFileStatus` guards against overwriting `"split"`
  - `applyPendingRenames` skips `"split"` files
  - `isFileInUse` returns false for `"split"` files

**Step 3 — FFmpeg Split Module**
- `splitFile(inputPath, splitPoints, outputDir)` in `ffmpeg.js`
- Stream copy (`-c copy -avoid_negative_ts make_zero`), no re-encode
- All-or-nothing: partial outputs deleted on failure
- Post-split probe calculates actual keyframe-snapped times

**Step 4 — Split IPC Endpoint**
- `split:execute` handler in main.js
- Creates child `file_metadata` records with `split_from_id` lineage
- Sets parent `is_split_source=1` + `status="split"`
- Logs to `rename_history` with `action="split"` and child IDs in `metadata_snapshot`
- `splitExecute` bridge method in preload.js

## Key Decisions
- FFmpeg split uses `-ss` before `-i` for fast seeking with stream copy
- Child files get temp names (`_split_N_timestamp.mp4`) — will be renamed by the preset engine when the Rename tab UI integration is built (step 7)
- `split:execute` handler creates metadata records immediately after FFmpeg completes (not deferred)
- Schema version is now 3

## Next Steps
Continue Phase 1 from step 5:
5. `importExternalFile` IPC + `pendingImports` Set
6. File watcher suppression (chokidar handler check)
7. Auto-split integration in Rename tab (probe, badge, preview, execute)
8. Drag-and-drop on Rename tab
9. Drag-and-drop on Recordings tab + quick-import modal
10. Rename history logging for splits (step 4 already logs basic split history — step 10 may just need refinement)

**Spec:** `C:\Users\IAmAbsolute\Desktop\ClipFlow stuff\video-splitting-spec-v3.md` (v3.1)

## Watch Out For
- Child files currently get temp names — step 7 must integrate with preset engine to produce proper names like `AR 2026-03-15 Pt1.mp4`
- `pendingImports` suppression (step 6) must use `{filename, sizeBytes}` matching per spec v3.1 Section 14.1
- The `split:execute` handler doesn't yet handle `splitSourceRetention: "delete"` — add source file deletion after successful split in step 7
- 2 unmigrated files from rename redesign (`OoA Day1 Pt1` and `CHS Day1 Pt1`) still have no matching Game Library entries
- Legacy feature removal (OBS log parser + voice modes) is still in `tasks/todo.md` but not yet started

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow-settings/clipflow-settings.json`
- Database file: `data/clipflow.db` (schema v3, 105 file_metadata rows)
- Migration logs: look for `(database)` scope — "Running migration v3" confirms split columns added
