# ClipFlow — Session Handoff
_Last updated: 2026-03-30 (Rename redesign steps 4-5)_

## Current State
App builds and launches cleanly. Rename system redesign steps 1-5 of 8 are complete — backend, preset engine, IPC, UI refactor, and file migration all done and working. Steps 6-8 remain (Recordings tab, AI pipeline, Settings UI).

## What Was Just Built

### Step 4 — Rename Tab UI Refactor (`RenameView.js`)
- **Grouped game/content dropdown** — Games and Content Types separated by visual headers via `entryType` field; new `GroupedSelect` inline component
- **Per-file preset selector** — Dropdown on each pending file card showing all 6 naming presets; defaults from electron-store `namingPreset`; changing per-file doesn't affect global default
- **Conditional input fields** — Day/Part spinboxes only for presets 1-2; custom label text input with autocomplete for presets 4-5; no extra fields for presets 3/6
- **Label autocomplete** — Fetches suggestions from SQLite `custom_labels` via `labelSuggest` IPC, ranked by frequency; dropdown with usage count
- **Label validation** — Red border + inline error for invalid filename chars; RENAME button disabled until valid
- **Live filename preview** — Preset-aware preview updates in real-time as user changes game/day/part/label/preset
- **DB-backed rename** — `renameOne`/`renameAll` now create `file_metadata` records in SQLite, record label usage, check collisions, trigger retroactive Pt1 renames
- **Retroactive part notifications** — Yellow banner with preset-specific message when collision detected
- **History tab hybrid** — Shows current session (local state) + past sessions from SQLite `rename_history`; RETRO badge for retroactive entries
- **8 new IPC handlers** in main.js — `preset:getAll`, `formatFilename`, `findCollisions`, `getNextPartNumber`, `calculateDayNumber`, `validateLabel`, `retroactiveRename`, `extractDate`
- **8 new bridge methods** in preload.js

### Step 5 — File Metadata Migration (`file-migration.js`)
- **File migration** — Scans watch folder monthly subfolders for `TAG YYYY-MM-DD DayN PtN.mp4` files, parses metadata, inserts `file_metadata` records with FFmpeg-probed durations and `fs.stat` file sizes
- **Project status detection** — Checks `.clipflow/projects/` for existing projects to set `status: "done"` vs `"renamed"`
- **Electron-store migration** — Adds `entryType: "game"` to all existing Game Library entries, adds JC (Just Chatting) content type, sets `namingPreset: "tag-date-day-part"` for existing users
- **Result:** 105/107 files migrated successfully; 2 skipped (tags OoA and CHS don't exist in Game Library)
- **Idempotent** — Flagged by `fileMigrationComplete` and `renameDesignMigrated` in electron-store

## Key Decisions
- **GroupedSelect as inline component** — Built directly in RenameView.js rather than adding to shared.js, since it has rename-specific header rendering logic
- **Hybrid history** — Current session still uses local React state + electron-store persistence (backward compat); past sessions read from SQLite. Full migration to SQLite-only history deferred to avoid breaking undo/redo flow mid-session
- **Migration runs async** — File migration with FFmpeg probes runs in background (non-blocking) so app window appears immediately; took ~19s for 105 files
- **JC default color** — `#9b5de5` (purple) to distinguish from game entries visually

## Next Steps
1. **Step 6: Recordings tab refactor** — Switch from filename scanning to SQLite queries. Display files based on `file_metadata` records filtered by status, grouped by date/month.
2. **Step 7: AI pipeline refactor** — Read `tag` and `entry_type` from `file_metadata` instead of parsing filenames. Load game profile by tag match. Skip game-specific features for content types.
3. **Step 8: Settings UI update** — Game Library with Games/Content Types sections, naming preset selector with format preview.

## Watch Out For
- **Design spec**: `C:\Users\IAmAbsolute\Desktop\ClipFlow stuff\rename-system-redesign-v5.md` is the canonical spec for steps 6-8
- **2 unmigrated files** — `OoA Day1 Pt1` and `CHS Day1 Pt1` have no matching Game Library entries. If user adds those games later, files won't auto-migrate (would need manual re-run or a "rescan" button)
- **`naming-presets.js` not yet called from renameAll collision detection** — The renameAll flow calls IPC for collisions but the collision/retroactive logic runs through the preset engine in main process. Verify collision detection works correctly with batch renames of same-tag same-day files
- **`isFileInUse()` editor check** is still stubbed (TODO) — only pipeline status check works
- **History tab local+SQLite split** — Current session renames appear in local state section; SQLite section shows "Previous Sessions". If user renames files and then switches to History, they see both sections. This is intentional but may look odd with zero SQLite entries on first launch after migration (since migration doesn't create rename_history entries)
- **Manage tab still reads from filesystem scan** (`managedFiles` prop) — not yet switched to SQLite. Step 6 will address this.

## Logs/Debugging
- App logs: `%APPDATA%/clipflow/logs/`
- Pipeline logs: `processing/logs/`
- Dev dashboard: Settings > click version 7x > purple card
- Store file: `%APPDATA%/clipflow-settings/clipflow-settings.json`
- Database file: `data/clipflow.db` (schema v2, now with 105 file_metadata rows)
- Migration logs: look for `(migration)` scope in electron-log output
- Database logs: look for `(database)` scope in electron-log output
