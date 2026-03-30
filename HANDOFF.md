# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Rename redesign steps 6-8)_

## Current State
App builds and launches cleanly. Rename system redesign steps 1-8 of 8 are **all complete**. The entire rename redesign is done — backend, preset engine, IPC, UI, file migration, Recordings tab, AI pipeline, and Settings UI all working end-to-end.

## What Was Just Built

### Step 6 — Recordings Tab Refactor (`UploadView.js`)
- **SQLite-backed file list** — Removed filesystem scanning (`fs:scanWatchFolder` IPC + `RENAMED_FILE_PATTERN` regex). Now loads files via `metadata:search` with `allRenamed` filter type
- **Month grouping from DB** — Groups by `f.date.slice(0, 7)` instead of folder name parsing
- **SQLite field mapping** — Uses `f.tag`, `f.current_filename`, `f.current_path`, `f.file_size_bytes`, `f.status`, `f.id` instead of old regex-parsed fields
- **Status from DB** — `isDone` checks `f.status === "done"` (SQLite) alongside legacy `doneFiles` + project match
- **Pipeline integration** — `handleGenerate` passes `fileMetadataId: file.id` to pipeline; refreshes from SQLite after completion
- **Removed bridge method** — `scanWatchFolder` removed from preload.js
- **Removed IPC handler** — `fs:scanWatchFolder` (~65 lines) and `RENAMED_FILE_PATTERN` constant removed from main.js
- **Manage tab switched to SQLite** — `RenameView.js` manage tab now uses `dbManagedFiles` with SQLite field names; `managedFiles` prop removed from App.js

### Step 7 — AI Pipeline Refactor (`ai-pipeline.js`, `ai-prompt.js`, `stable-ts.js`)
- **Pipeline status lifecycle** — `updateFileStatus()` helper sets `processing` at start, `done` on success, `renamed` on failure
- **Pending rename dequeue** — `applyPendingRenames()` runs on pipeline completion (success or failure), checks `has_pending_rename`, renames physical file, updates DB
- **Game-aware vocabulary** — Looks up `gameEntry` from `gamesDb`, builds `gameVocab` string, passes to Whisper via `opts.gameVocab`
- **Content type support** — Skips `gameProfiles.ensureProfile` for `entryType === "content"`; `buildSystemPrompt` uses "CONTENT CONTEXT" header for content types
- **Dynamic Whisper vocab** — Removed hardcoded game terms from `stable-ts.js`; now appends `opts.gameVocab || ""` dynamically
- **Project tracking** — `fileMetadataId` stored in project record via `projects.createProject`

### Step 8 — Settings UI Update (`SettingsView.js`, `modals.js`)
- **Game Library split** — Games section (filtered by `entryType !== "content"`) and Content Types section (filtered by `entryType === "content"`) with visual divider
- **Separate add buttons** — "+ Add Game" and "+ Add Content Type" buttons trigger `onAddGame("game")` or `onAddGame("content")`
- **AddGameModal entry types** — Accepts `entryType` prop; dynamic header/label text; purple default color for content types
- **Tag uniqueness validation** — `GameEditModal` checks tag against all `gamesDb` entries; red border + error when duplicate; Save button disabled
- **Naming Preset selector** — Card with 6 radio-style options showing label + example filename format; persists selection to electron-store

## Key Decisions
- **`allRenamed` filter** — New predefined filter in `metadata:search` returns all non-pending files ordered by date DESC, renamed_at DESC
- **Dual status check** — Recordings tab checks both SQLite `status === "done"` AND legacy `doneRecordings` electron-store for backward compatibility
- **`showAddGame` state changed** — From `boolean` to `string|null` ("game"/"content"/null) to carry entry type through to AddGameModal
- **dayCount migration preserved** — App.js migration now queries SQLite instead of filesystem scan
- **Pipeline reverts on failure** — Status goes back to `renamed` (not `pending`) so file stays visible in Recordings tab

## Next Steps
The rename redesign (v5 spec) is fully implemented. Potential follow-up work:
1. **End-to-end pipeline test** — Run a real clip generation to verify `fileMetadataId` flows through pipeline → project → status update → pending rename dequeue
2. **Rescan button** — For the 2 unmigrated files (OoA, CHS tags) that were skipped during migration
3. **Game Library CRUD** — Edit/delete games from Settings (currently can only add)
4. **`isFileInUse()` editor check** — Still stubbed (TODO) in rename collision logic

## Watch Out For
- **2 unmigrated files** — `OoA Day1 Pt1` and `CHS Day1 Pt1` have no matching Game Library entries
- **`isFileInUse()` editor check** is still stubbed (TODO) — only pipeline status check works
- **History tab local+SQLite split** — Current session renames appear in local state section; SQLite section shows "Previous Sessions"
- **Collision detection in batch** — renameAll collision/retroactive logic runs through preset engine. Verify with batch renames of same-tag same-day files

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow-settings/clipflow-settings.json`
- Database file: `data/clipflow.db` (schema v2, now with 105 file_metadata rows)
- Migration logs: look for `(migration)` scope in electron-log output
- Database logs: look for `(database)` scope in electron-log output
