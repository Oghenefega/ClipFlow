# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Rename redesign steps 1-3)_

## Current State
App builds and launches cleanly. Database foundation for the rename system redesign is complete (steps 1-3 of 8). No UI changes yet — all work is backend/main process.

## What Was Just Built

### Step 1 — Shared SQLite Database (`src/main/database.js`)
- Created `database.js` — shared DB manager with version-tracked migration system
- Consolidated `feedback.db` into `clipflow.db` (single DB, tables provide separation)
- Migration v1: feedback table, Migration v2: file_metadata + custom_labels + rename_history tables with all indexes
- On first launch: copies old `feedback.db` → `clipflow.db`, renames old file to `.bak`
- Fixed bug: DB now properly closes on app quit (was never closed before)

### Step 2 — Naming Preset Engine (`src/main/naming-presets.js`)
- Pure logic module with 6 preset definitions and metadata flags
- `formatFilename()` — builds filename from metadata + preset ID
- `validateLabel()` — rejects Windows-invalid filename characters
- `calculateDayNumber()` — day increment rules (skipped days don't matter, same day = same number, manual override)
- `findCollisions()` — preset-aware collision detection (tag+date, tag+label, tag+date+label, tag+original)
- `getNextPartNumber()` — finds max part for collision key group
- `retroactiveRename()` — safety check (isFileInUse) → queue or execute immediately
- `applyPendingRenames()` — event-driven dequeue for pipeline completion / editor close

### Step 3 — IPC Bridge (`main.js` + `preload.js`)
- 8 new endpoints on `window.clipflow`:
  - `fileMetadataCreate`, `fileMetadataUpdate`, `fileMetadataSearch`, `fileMetadataGetById`
  - `labelSuggest`, `labelRecord`
  - `renameHistoryRecent`, `renameHistoryUndo`
- `fileMetadataSearch` uses predefined query shapes (byTag, byStatus, byTagDate, byTagLabel, byDateRange) — no dynamic WHERE builder
- Undo supports cascading reversal of retroactive renames via `triggered_by` chain

### Refactored
- `src/main/feedback.js` — stripped DB management, now uses shared `database.getDb()`
- `src/main/ai-pipeline.js` — removed `feedback.init()` call (DB initialized once at startup)
- `src/main/main.js` — added database import, init at startup, close on quit

## Key Decisions
- **Single `clipflow.db`** — merged feedback + metadata into one SQLite file. One app, one DB.
- **Games stay in electron-store** — `file_metadata.tag` is the join key. No library_entries table yet.
- **Schema versioning** via `schema_version` table — future migrations add to the MIGRATIONS array in database.js
- **Preset engine is a separate module** — pure logic, testable in isolation, imported by main.js
- **`_uuid()` helper** added to main.js for IPC handlers that create records
- **Retroactive rename safety** — `isFileInUse()` checks pipeline status; editor check is a TODO for step 4+

## Next Steps
1. **Step 4: Rename tab UI refactor** — grouped game/content dropdown, preset-driven input fields, preset selector, live filename preview, retroactive part notifications. This is the biggest step.
2. **Step 5: File metadata migration** — one-time migration parsing existing 107 renamed files into SQLite
3. **Step 6: Recordings tab refactor** — switch from filename scanning to SQLite queries
4. **Step 7: AI pipeline refactor** — read tag/entry_type from file_metadata instead of parsing filenames
5. **Step 8: Settings UI update** — Game Library with Games/Content Types sections, naming preset selector

## Watch Out For
- **Design spec**: `C:\Users\IAmAbsolute\Desktop\ClipFlow stuff\rename-system-redesign-v5.md` is the canonical spec — read it before starting step 4
- **`data/feedback.db.bak`** exists as backup — safe to delete after confirming clipflow.db works
- **`isFileInUse()` editor check** is stubbed (TODO) — only pipeline status check works currently
- **`naming-presets.js`** is not yet imported by main.js IPC handlers — it will be wired in during step 4 when the Rename tab calls the preset engine through the IPC bridge
- **Two Electron windows** during testing — use task manager to kill all electron.exe before relaunching

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow-settings/clipflow-settings.json`
- Database file: `data/clipflow.db` (schema v2)
- Database logs: look for `(database)` scope in electron-log output
