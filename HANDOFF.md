# ClipFlow — Session Handoff
_Last updated: 2026-04-17 (session 14) — "#60 unified test-mode, end-to-end"_

---

## TL;DR

Shipped [#60](https://github.com/Oghenefega/ClipFlow/issues/60) in full across four commits (14, 14b, 14c, 14d). **Closed.** Per-clip `testMode` is now the canonical flag across Rename → Recordings → Projects → Editor → Queue, with physical-file routing enforced at every pipeline stage. Disk reality and UI state are kept in sync: toggling TEST on a recording card physically moves the file between `<watchFolder>\<YYYY-MM>\` and `<testWatchFolder>\<YYYY-MM>\`, and a startup reconciliation pass repairs drift (legacy rows, Explorer-made moves).

Key architecture choice: dedicated `testMode` boolean on projects (not tag-based), with read-time migration from legacy `tags: ["test"]` so no one-shot migration script is needed. Publish is hard-blocked for test clips at three layers — UI button disabled, renderer-side early-return, main-process handler early-return with `{ error, testBlocked: true }` in the publish log.

Current HEAD: **f088c00** (backfill SQL LIKE bug fix — rewrote to JS-side path filter because Windows backslashes conflicted with SQL LIKE escape semantics).

## 🎯 Next session — pick one (no blocker forces it)

Both Critical items are gone. The remaining infra arc has three natural next steps:

1. **[#57](https://github.com/Oghenefega/ClipFlow/issues/57) editor perf — proper fix direction.** Component extraction approach at [#57 comment](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430): extract `<TimelinePlayhead />` from TimelinePanelNew + `<SegmentRow />` as `React.memo`'d child from LeftPanelNew. Fega's actual friction on long sources. Do **NOT** retry the store-derivation approach in any form.
2. **[#52](https://github.com/Oghenefega/ClipFlow/issues/52) electron-store 8→11 + [#53](https://github.com/Oghenefega/ClipFlow/issues/53) chokidar 3→4 (H5/H6).** Both ESM-only, both unblocked by Vite (session 13). chokidar is the higher-risk of the two — underpins the OBS recording watcher, any `awaitWriteFinish` regression silently breaks the top of the pipeline. Can be one focused session.
3. **[#59](https://github.com/Oghenefega/ClipFlow/issues/59) editor render without queuing.** Dedicated session — unrelated to the #60 work but still open.

If unsure: **H5/H6** is the next logical infra step now that C1 and C2 are done and #60 unblocks real testing.

## 🚫 DO NOT touch next session (preserved)

- **Do NOT retry the [#57](https://github.com/Oghenefega/ClipFlow/issues/57) store-derivation approach** in any form. That layer is rejected — session 11 broke it twice.
- **Do NOT skip the zoom-slider repro on any future infra hop.** Standing go/no-go for Electron and build-tool changes.
- Do NOT touch H4 ([#50](https://github.com/Oghenefega/ClipFlow/issues/50)), H9 ([#56](https://github.com/Oghenefega/ClipFlow/issues/56)), or [#51](https://github.com/Oghenefega/ClipFlow/issues/51). All deferred per pre-beta priority framing.

## 📋 Infrastructure board state after this session

| Item | Issue | Status |
|---|---|---|
| **C1 Electron upgrade arc** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | ✅ closed session 12 |
| **C2 Vite migration** | [#46](https://github.com/Oghenefega/ClipFlow/issues/46) | ✅ closed session 13 |
| **#58 File.path migration** | [#58](https://github.com/Oghenefega/ClipFlow/issues/58) | ✅ closed session 12 |
| **H8 @types/node pin** | [#55](https://github.com/Oghenefega/ClipFlow/issues/55) | ✅ closed session 12 |
| **#35 renderer crash** | [#35](https://github.com/Oghenefega/ClipFlow/issues/35) | ✅ closed session 10 |
| **#60 test-mode toggle** | [#60](https://github.com/Oghenefega/ClipFlow/issues/60) | ✅ **closed this session** — unified per-clip test-mode across 4 tabs + physical move + startup reconciliation |
| **#57 editor perf on long source** | [#57](https://github.com/Oghenefega/ClipFlow/issues/57) | 🔲 UNRESOLVED — proper fix direction documented, deferred |
| **#59 editor render without queuing** | [#59](https://github.com/Oghenefega/ClipFlow/issues/59) | 🔲 dedicated session |
| H1 subtitle overlay hardening | [#47](https://github.com/Oghenefega/ClipFlow/issues/47) | 🔲 ready |
| H3 sandbox flip | [#49](https://github.com/Oghenefega/ClipFlow/issues/49) | 🔲 ready |
| H5 electron-store 8→11 | [#52](https://github.com/Oghenefega/ClipFlow/issues/52) | 🔲 unblocked session 13 |
| H6 chokidar 3→4 | [#53](https://github.com/Oghenefega/ClipFlow/issues/53) | 🔲 unblocked session 13 |
| H2 CSP | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | 🔲 unblocked — nonce-based policy still needed |

## ✅ What was built this session

### Commits

- **3f41acb** — Session 14: initial unified test-mode implementation. `testMode` boolean on projects, `TestChip` component, RenameView + ProjectsView + UploadView + QueueView wiring, publish gates at 3 layers, pipeline routing via `resolveTestAwareOutputFolder`, read-time migration of legacy `tags:["test"]`.
- **6bcc69a** — Session 14b: post-hoc toggle physically moves file. `file:moveToTestMode` IPC with `fs.renameSync` + EXDEV copy-and-unlink fallback for cross-drive moves, EBUSY/EPERM detection → `{ error, locked: true }`. Recordings tab All/Main/Test filter. Move-failure toast.
- **28cb67f** — Session 14c: startup `is_test` reconciliation. Bidirectional backfill (flag under testRoot, unflag outside testRoot) that runs on every `app.whenReady` when `testWatchFolder` is set.
- **f088c00** — Session 14d: backfill fix. Original used SQL `LIKE ... ESCAPE '\'` but Windows paths contain `\` which the SQL engine treats as escape chars → pattern never matched. Rewrote to JS-side path filter with lowercase `startsWith` and per-ID UPDATE.

### Files touched

- **New:** [src/renderer/components/TestChip.js](src/renderer/components/TestChip.js)
- **Main process:** [src/main/main.js](src/main/main.js), [src/main/projects.js](src/main/projects.js), [src/main/preload.js](src/main/preload.js), [src/main/ai-pipeline.js](src/main/ai-pipeline.js)
- **Renderer:** [src/renderer/App.js](src/renderer/App.js), [src/renderer/views/RenameView.js](src/renderer/views/RenameView.js), [src/renderer/views/ProjectsView.js](src/renderer/views/ProjectsView.js), [src/renderer/views/UploadView.js](src/renderer/views/UploadView.js), [src/renderer/views/QueueView.js](src/renderer/views/QueueView.js)

## 🔑 Key decisions this session

1. **`testMode` boolean over `tags: ["test"]`.** Tags are free-form and leak into titles, filters, and AI prompts. A dedicated flag is readable without string-matching. Legacy data gets migrated at read time via `normalizeProject()` — no one-shot script.
2. **Physical move, not flag-only, for post-hoc Recordings toggle** (reversed the initial Option A decision mid-session). Fega's mental model is folder-based: `Test Footage\` on disk = test flag in UI. Flag-only would let disk reality diverge and defeat the point of the test-isolation feature.
3. **Publish gated at 3 layers** (UI disabled, renderer early-return, main-process early-return). Belt-and-suspenders because a test clip accidentally publishing to live socials is catastrophic for a creator product.
4. **Startup reconciliation runs every launch, bidirectionally.** Idempotent. Catches both pre-existing rows from before the `is_test` column and manual Explorer-made moves outside the app.

## ⚠️ Watch out for

- **`db.run()` in sql.js returns the DB object, not a changes summary.** Use `db.getRowsModified()` after. I tripped on this in session 14c. Anywhere else using `.changes` on the result of `db.run` is wrong.
- **SQL `LIKE ... ESCAPE '\'` is hostile to Windows paths.** Use JS-side path filtering (`path.toLowerCase().startsWith(prefix)`) or pick a different escape char (`^`) if you really need SQL-side matching.
- **Post-hoc move is destructive** (file actually moves). If the user has an Explorer window, rendering job, or editor tab open on the file, the move fails with EBUSY/EPERM and the IPC returns `{ locked: true }`. The renderer reverts the chip — but any code that assumes the file is at its new path immediately after the toggle will race.
- **`isTest` now threaded through 4 publish handlers** (tiktok/instagram/facebook/youtube). Any new platform handler added in the future must accept `isTest` and early-return with `publishLog.logPublish({ status: "skipped", error: "..." })` — otherwise the UI/renderer gates can be bypassed if a bug lets a test clip through.

## 🪵 Logs / Debugging

- **Electron main logs:** `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\logs\` — one file per module + `main.log`. The reconciliation pass logs `is_test reconciliation: +N flagged, -M unflagged (testRoot=...)` via `logger.MODULES.system` on every startup where the counts are nonzero. Silence = no drift.
- **If legacy test content doesn't appear under the Test group after restart:** check `logs\main.log` for the reconciliation line. If the line is missing, `testWatchFolder` isn't set in Settings. If it shows `+0 flagged`, no file_metadata rows have `current_path` under the test folder — means those files were never renamed through ClipFlow (raw OBS files still on the Rename tab, not Recordings).
- **If TestChip toggle fails silently:** open DevTools (Ctrl+Shift+I in dev mode) and look for `[RecordingsView] testMode toggle failed:` in the console. The renderer catches the IPC error and reverts the optimistic update; the red 5s toast shows the underlying error.
- **If publish is still firing on a test clip:** that's a three-layer bypass — check in order: (1) is `clip._projectId` populated and does the project's `testMode` resolve true in `projectTestMap`? (2) is `isClipTest(clip)` returning true in `publishClip`? (3) is the main-process handler receiving `isTest: true` in the payload? The publish log in `logs\publishing.log` records what the main process saw.
- **Sentry:** errors from the renderer surface under project `flowve/clipflow` (see [reference_sentry_api.md](C:/Users/IAmAbsolute/.claude/projects/C--Users-IAmAbsolute-Desktop-ClipFlow/memory/reference_sentry_api.md)). Publish-block errors aren't exceptions so they won't appear there — by design.

## 🔄 Build & verify

```bash
npm run build:renderer       # Vite build (~11s, 2728 modules, 1.85MB minified)
npm start                    # Launch Electron
```

Renderer changes are picked up on app restart. **Main-process changes (main.js, preload.js, projects.js, ai-pipeline.js) require a full Electron quit + relaunch** — closing the window isn't enough on Windows if background processes linger. Use Task Manager to kill stray `electron.exe` if the new IPC handlers aren't responding.
