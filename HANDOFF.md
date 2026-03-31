# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Settings reorganization + Quick Import file size fix)_

## Current State
App builds and launches cleanly. Settings page reorganized into 6 collapsible groups. Quick Import file size bug fixed.

## What Was Just Built

### Settings Page Reorganization
- Restructured flat list of 17+ cards into **6 logical collapsible groups**:
  1. **Files & Folders** (expanded) — Watch Folder, Output Folder, SFX Folder, Video Splitting
  2. **Content Library** (expanded) — Main Game Pool, Games & Content Types, Naming Preset
  3. **AI & Style** (collapsed) — Title & Caption Style Guide, AI Preferences
  4. **Publishing** (expanded) — Connected Platforms, Queue Settings
  5. **Tools & Credentials** (collapsed) — Local Tools, BetterWhisperX Config, API Credentials
  6. **Diagnostics** (collapsed) — Pipeline Logs, Report an Issue, Subtitle Debug Log
- Each group has a clickable header with chevron indicator and Show/Hide text
- Groups 3, 5, 6 start collapsed (set-once or troubleshooting sections)
- Dev Dashboard remains outside groups (hidden behind version click counter)

### Quick Import File Size Bug Fix
- `UploadView.js` now passes `fileSizeBytes: quickImport.importEntry?.sizeBytes` to `fileMetadataCreate()` for both single-file and split import paths
- Previously, imported files always showed "0 B" because `fileSizeBytes` was never sent to the database

## Key Decisions
- Group-level collapse only (no individual card collapse) — keeps the UX simple, one click to show/hide a whole category
- Groups 1, 2, 4 expanded by default — these are day-to-day settings users check frequently
- Groups 3, 5, 6 collapsed by default — AI preferences, tool config, and diagnostics are set-once or troubleshooting
- Disconnect confirmation dialog is inside the Publishing group conditional — fine since it's `position: fixed` and only triggered when viewing platforms
- Output Folder and SFX Folder moved from random middle positions to Files & Folders group at the top

## Next Steps
1. **Test game-switch scrubber end-to-end** — still untested from previous session
2. **Investigate thumbnail generation hang** — "Preparing preview..." stuck, debug logging added but root cause unknown
3. **Backfill file sizes for existing imports** — already-imported files still show "0 B" (would need a DB migration or one-time backfill script)
4. **Wire `splitSourceRetention: "delete"`** — source files always kept after split, delete path not implemented
5. **Legacy feature removal** — OBS log parser + voice modes still in `tasks/todo.md`
6. **Instagram/Facebook login flow split** — paused, plan exists

## Watch Out For
- **Already-imported files still show 0 B** — the fix only applies to new imports going forward
- **Disconnect dialog inside collapsed group** — if Publishing group is collapsed, the disconnect dialog won't render. This is fine because you can only trigger disconnect from the Connected Platforms card (which requires the group to be expanded)
- **Thumbnail generation not yet verified** — "Preparing preview..." was stuck during previous session's testing
- `splitSourceRetention: "delete"` not implemented — source files always kept
- DB was re-migrated last session (105 files) — if DB gets recreated again, same issue will recur

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow/clipflow-settings.json`
- Database file: `data/clipflow.db` (schema v3)
- Thumbnail temp dir: `%TEMP%/clipflow-thumbs/` (cleaned up on app quit)
- Thumbnail debug: check `(thumbs)` scope in app logs + `[Scrubber]` in DevTools console
