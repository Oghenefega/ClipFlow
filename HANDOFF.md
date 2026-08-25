# HANDOFF — Session 194 (2026-08-25)

> Pending session title (set automatically at next session start): S194 · Batch 4 shipped — the first ten minutes don't look broken

## Current State

**Batch 4 is built, verified AND fresh-eyes reviewed — `1b7e78d` + `e2c3031` + the s195
review commit.** #153, #152 and #74 are all closed `status: untested`. The review found
two real bugs (the resting completion headline read "nothing made the cut" on every
successful run because UploadView's post-invoke setProgress clobbered the pipeline's
clipCount/signalSummary; the project context-menu Delete passed an id into the
object-taking handleSingleDelete, deleting `undefined`) plus glow-less status dots —
all three fixed and verified (headline via direct checks on the real object shapes,
boot via dev profile; the reconciliation logger fix from #152 fired live on that boot).
That completes batches 1–4 (~14 issues), none of which has reached a machine: desktop
and laptop are still on **0.4.0-alpha.4**, by design.

#304 filed (dead `STAGE_LABELS` map in `UploadView.js`) and left open on purpose.

## Key Decisions

1. **#74 is not a relabel — the mapping itself was the leak (Fega's call).** The issue
   proposed one branded label per internal label; Fega rejected two drafts of that table
   because a per-stage line still publishes stage count, order and boundaries. Shipped
   instead: 3-5 lines drawn per recording from a pool of 50 in `WORKING_LINES`
   (`UploadView.js`), bucketed early/middle/late, rotating on real progress. Nothing on
   screen corresponds to a stage, a signal or a model.
2. **The `devMode` gate in #74's acceptance criteria was deliberately NOT built.** Fega:
   dev mode is a leftover from when he was learning the app, not the place internals
   should live. There is now no in-app way to re-expose the technical labels. The full
   technical record stays in `processing/logs/<video>.log` via `logger.failStep`. Knock-on
   benefit: `ai-pipeline.js` needed zero changes — the renderer just stopped rendering
   `progress.detail`.
3. **#152 got a confirm dialog, not the undo toast the ticket asked for.** `deleteProject`
   is an `fs.rmSync` with no recycle bin and no soft delete, so an undo button would have
   been a fake undo (the #175 class of lie). The dialog names the project and its clip
   count instead. Bulk delete keeps its existing two-click confirm — deliberately not
   unified, to stay surgical.
4. **The line pool is data, not logic.** Fega marked 18 lines good, 15 bad, 17 usable-with-
   tweaks on a screenshot; the shipped 50 keep all 18 greens verbatim, cut all 15 reds,
   rework the 17, and add 15 new. Changing any line is a one-line edit in `WORKING_LINES` —
   expect him to want a few changed after he sees them live.

## Next Steps

1. ~~Fresh-eyes review of batch 4~~ — DONE s195, caught two real bugs (see Current State).
2. **Cut ONE installer** covering batches 1–4. Optional batch 5 first if there is
   room: #157, #151, #158.
3. When Fega tests batch 4: the three watcher states on the Rename tab, the delete dialog,
   and — the one thing never seen on screen — the **completion** headline on a real
   generation ("✅ N clips ready for you").
4. #304 should be settled now that #74 has landed (it was parked to avoid a conflict).

## Watch Out For

- **The completion / degraded / failed headlines were never seen on screen.** Verified by
  19 direct function checks only. The card auto-clears 3s after finishing and both live
  runs cleared between polls. The *running* state was watched live across two real runs.
- **`log` is not a binding in `main.js` module scope.** Four call sites in `project:delete`
  and `project:list` used it and threw `ReferenceError` at runtime — every delete returned
  `{ error: "log is not defined" }` after succeeding, and `project:list` returned **zero
  projects** whenever reconciliation reset an orphaned file. Fixed to `logger`. The seven
  remaining bare `log.` calls (main.js ~4055-4208) are fine — those two functions define
  `log` locally. Don't "tidy" them into `logger`.
- **`pipeline:signalProgress` is now emitted with no renderer subscriber.** Left in the
  main process on purpose; it costs nothing and the data still reaches the log.
- **A future summary/list IPC must not strip `progress.clipCount` or `signalSummary`** —
  the headline is the only place clip count is now shown at the end of a run.
- **All s190/s192/s193 watch-items still stand:** `gatewayAuthTokenPreMigration` has no
  reader (keep until the installer reaches the laptop); prod profile has NOT run the #301
  migration; "Corva Default" still never seen on screen; `LEGACY_TIME_SLOTS` in App.js is
  load-bearing; `SUPPORTED_EXTENSIONS`/`normalizeExtension` in naming-presets.js has
  exactly one live caller; `source` on clip objects has two live values (`"import"`,
  `"silent-fallback"`).
- **The wrap-changelog hook** blocks any commit whose message contains "wrap" when
  CHANGELOG.md is untouched in the working tree AND absent from the last commit. This wrap
  commit rides on CHANGELOG being in `e2c3031`.

## Logs / Debugging

- **Scratchpad for this session** (`…\2acb5ac4-…\scratchpad\b4\`), all reusable:
  `cdp.js` (Runtime.evaluate driver), `shot.js` (Page.captureScreenshot to a file),
  `setfolder.js` (drives Settings → Watch Folder → Edit → Save, the real UI path),
  `test-lines.js` (extracts the #74 pure functions out of the JSX and exercises every
  branch — 19 checks), `patch74.py`, `issue-74-progress-card.html` (the mock Fega marked
  up), plus `state-yellow.png` / `state-red.png` / `card-running.png`.
- **How the pipeline was exercised cheaply:** `ffmpeg -ss 420 -t 60 -map 0 -c copy` off a
  real recording into a scratch watch tree, dev profile repointed at it
  (`watchFolder` + `projectsRoot`), renamed through the real Rename flow, then
  "Clip 1 Recording". Full run ≈70s. Restore the profile from `settings-backup.json`
  afterwards — it holds Fega's real paths.
- **Locking a file to force a delete failure:** a live process with its **CWD** inside the
  directory does NOT work (Windows marks the dir delete-pending and `rmSync` still
  reports success). A process holding an **open file handle** inside it does — see
  `lockfile.py`.
- **Un-marking a "done" recording via CDP is unreliable** once the row label becomes
  "✓ N"; it worked when the label was a bare "✓". This is what stopped the completion-frame
  screenshot. Worth a better handle if more Recordings E2Es are needed.
- App log: `%APPDATA%\clipflow-dev\logs\app.log`. Pipeline logs:
  `%APPDATA%\clipflow-dev\processing\logs\<video>_<ts>.log` — still fully technical.
