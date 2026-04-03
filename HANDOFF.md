# ClipFlow — Session Handoff
_Last updated: 2026-04-03 — "Test Watch Folder"_

## Current State
App builds and launches. Test watch folder feature is fully implemented across the entire pipeline: Settings UI, file watcher, rename, recordings grouping, project tagging, and render output isolation. Schema at V4.

## What Was Just Built

### Test Watch Folder (dev-mode second watcher)
- Settings UI: "Test Folder" card with Browse/Edit/Clear and yellow DEV badge, directly below Watch Folder
- Stored in electron-store as `testWatchFolder` (default: empty string)
- When set, activates a second chokidar instance via `watcher:startTest` IPC
- Shared detection logic: extracted `handleWatcherFileAdded()` and `createOBSWatcher()` — zero duplication between main and test watchers
- Separate IPC events (`watcher:testFileAdded` / `watcher:testFileRemoved`) prevent listener cross-contamination
- Same-folder guard prevents setting test folder = main watch folder

### is_test Column (Schema V4)
- `ALTER TABLE file_metadata ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0` with index
- Set to 1 at `metadata:create` when `data.isTest` is truthy
- Inherited by split children in `split:execute` handler via `parentFile.is_test`

### Pipeline Integration
- **Rename tab:** Test files show yellow "TEST" pill badge. Pending file dedup changed from `fileName` to `filePath` to handle same-name files in both folders. Test pending files cleared on folder change.
- **Recordings tab:** `is_test === 1` files grouped as "Test" (pinned to top) instead of month group
- **Generate:** UploadView passes `isTest: file.is_test === 1` in gameData to pipeline
- **Projects:** `tags: []` array added to project schema. Test projects get `tags: ["test"]`. Yellow "TEST" pill on project cards.
- **Render:** Both `render:clip` and `render:batch` check `projectData.tags` for "test" — test project renders go to `{testWatchFolder}\ClipFlow Renders\` instead of main output folder

## Key Decisions
- Separate IPC events for test watcher (not a flag on the same event) — cleanest isolation for listener lifecycle
- `tags` array on projects is forward-compatible for future tagging/filtering features
- Render output routed by project tags, not file_metadata is_test — the project is the unit of work at render time
- Test files use the same collision/naming system as real files — no special casing (user will use custom label presets like `tag-label` for test content)

## Next Steps
1. **Full end-to-end test** — set test folder, drop OBS file, rename, generate clips, render, verify all artifacts land in test folder tree
2. **Project tags UI** — general-purpose tag CRUD (add/remove/edit arbitrary tags), filtering in Projects tab
3. **Sentry backlog** — 7 deferred items before launch
4. **Pill sizing refinement** from previous session

## Watch Out For
- `testWatchFolder` empty string is the "not set" state — guard checks use `if (!testWatchFolder)` which treats `""` as falsy. Don't change to `null` without updating all guards.
- Test watcher cleanup effect in RenameView filters `prev.filter(p => !p.isTest)` — if `isTest` is ever undefined on old pending objects, they'd survive the filter (correct behavior, but be aware)
- `createOBSWatcher` is called from IPC handlers, not at app startup — the watcher only starts when the renderer calls `startTestWatching()`
- Existing projects on disk won't have `tags` field — all code uses `proj.tags || []` to handle this gracefully
- The `ClipFlow Renders` subfolder inside test folder is auto-created by render.js `fs.mkdirSync(dir, { recursive: true })` on first render

## Logs / Debugging
- Test watcher logs use the same `[chokidar]` pattern as main watcher — differentiate by the folder path in the log
- Schema migration logged as `Running migration v4: Add is_test flag to file_metadata for test watch folder files`
- To check if a file has is_test set: `SELECT id, current_filename, is_test FROM file_metadata WHERE is_test = 1`
- To check project tags: read `project.json` in `.clipflow/projects/{id}/` and inspect `tags` array
