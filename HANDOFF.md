# ClipFlow — Session Handoff
_Last updated: 2026-07-18 — Session 113 CLOSED — **Fega's 3 reported issues fixed (ghost recordings, invisible Day7 files, watch-folder move), shipped in the 0.2.2-alpha.1 installer (cut, NOT yet installed). He must install, then set the watch folder to the Recordings root.**_

---

## One-line TL;DR
Diagnosed all three of Fega's issues to one root cause pair (Recordings tab trusted the DB, DB never reconciled with disk; watch folder doubled as the project-library root), built the reconcile pass + `projectsRoot` split + depth-2 watcher + in-place month rename, fixed test-rename counter pollution (#170) and month-folder nesting (#171), sandbox-verified everything end-to-end, and cut 0.2.2-alpha.1.

## Current State
- **0.2.2-alpha.1 installer is in `dist/`, NOT yet installed.** It carries BOTH last session's audio calibration wizard (0.2.1-alpha.1 was never installed) and today's fixes. In-app "Install update" banner will surface it.
- **After installing, Fega does ONE manual step:** Settings → Watch Folder → set to `W:\YouTube Gaming Recordings Onward\Recordings` (the tree root, NOT the `Arc Raiders\2026-07` month folder — the watcher now sees two levels deep, so month rollover and new game folders need no re-pointing).
- On first Recordings load post-install, against his real data: the 4 ghosts (RL 2026-03-04, JC 2026-03-23, JC 2026-03-23 Day1 Pt1, RL 2026-07-15) hide behind a "Clean up" notice; the 4 untracked `RL 2026-03-04 Day7 Pt1-4` files get adopted into March 2026; the RL day counter repairs 9 → 7 (next real RL rename = Day8).
- **#170, #171 OPEN with fix-shipped comments** — close (with `status: untested` removed) when Fega confirms on the installed build. #169 (wizard) also still open awaiting his hands-on pass from last session.
- Dev profile fully restored to pre-session state (backed up → sandboxed → restored; RL 6/2026-03-02, projectsRoot unset — the pin-once migration will set it to the real vertical folder on next dev boot, which is correct).
- Prod store/DB were only ever read this session (read-only diagnosis) — all real-data changes happen via the app after he installs.

## What Was Built (commit e0d191d + bump)
- **`src/main/reconcile.js` (new):** on every Recordings load — (1) flags rows whose `current_path` is gone (drive-root reachability guard: unplugged W: flags nothing); (2) adopts untracked renamed files from library root + watch folder, root + 2 levels, legacy date-first AND tag-first formats, known gamesDb tags only, test folders excluded; (3) repairs impossible day counters (lastDayDate > today) from non-test rows, runs AFTER adoption so recovered rows count. `removeMissing(ids)` is the ONLY place file_metadata rows are ever deleted; re-verifies each file is still gone first.
- **Library/watch split:** `projectsRoot` store key + pin-once migration in `runStoreMigrations` (condition-idempotent, no armed flag); `libraryRoot()` helper in main.js; all 20 project-storage call sites swapped (waveform cache, project CRUD, pipeline, transcripts, render updateClip, pollution migration, folder:list); watch-side sites (watcher, import, moveToTestMode physical move, test-output fallback) deliberately stay on `watchFolder`. Settings watch-folder card shows a library note when the two differ.
- **Watcher depth 0 → 2** (`createRecordingFolderWatcher`) + explicit ignore roots (testWatchFolder, `<root>\Test`, `<root>\Test Footage`) so test footage can't surface as a normal recording.
- **RenameView:** shared `resolveTargetDir` — in-place rename when the source dir already ends in `YYYY-MM` (#171); `fileMetadataCreate` failure now surfaces via retroNotification (was silently swallowed — the proven mechanism behind the invisible Day7 files); test renames skip the dayCount/lastDayDate writeback in both renameOne and renameAll (#170).
- **Counter-repair renderer sync:** reconcile returns `repairedGames` → main emits `gamesDb:changed` → App.js setGamesDb — without this, App's boot-loaded copy would persist stale counters right back on the next rename.
- **UploadView:** `loadAndReconcile` is the single full-list load path (mount, refresh, resetFileDone, quick-import — all routed through it so ghosts can't resurrect via a raw search); missing-file notice + Clean up + adoption toast, rendered in both list and empty states.

## Key Decisions
- **Missing rows are hidden + cleaned manually, never auto-deleted** — offline-drive safety beats zero-click cleanup.
- **Adoption is automatic and silent** (plus a toast) — correctly-named files of known tags are unambiguous; label-only preset names are NOT adopted (indistinguishable from arbitrary videos).
- **projectsRoot pins to the OLD watch folder** rather than moving `.clipflow` — clip filePaths in project.json are absolute (projects.js:308), a move would need a path-rewrite migration for zero benefit.
- **Counter repair keys on the impossible state** (future lastDayDate) so it can run every reconcile without fighting legitimate counters.
- Version sized 0.2.1-alpha.1 → 0.2.2-alpha.1 (another substantial subsystem batch = minor bump + counter reset).

## Next Steps (priority order)
1. **Fega installs 0.2.2-alpha.1** (banner or `dist\ClipFlow Setup 0.2.2-alpha.1.exe`; Settings bottom must read v0.2.2-alpha.1).
2. **Fega sets watch folder to `W:\YouTube Gaming Recordings Onward\Recordings`** — his 9 Arc Raiders raws should appear in the Rename tab immediately.
3. He verifies: ghosts → Clean up works; Day7 files visible under March 2026; renaming an Arc Raiders raw proposes Day-something sane and lands in the same `2026-07` folder. Then close #170/#171 (+ #169 wizard pass from session 112).
4. Standing next candidate: #167 proper fix (neutral STORE_DEFAULTS + wizard-owned folder setup) — the projectsRoot split just removed its scariest hazard class (dev profile writing projects into the real tree still applies until dev's watchFolder changes, but the library pin now contains it).
5. Stretch on #169: per-track whisper auto-suggest; sparse-warning on strict-abort runs.

## Watch Out For
- **Two-writer gamesDb hazard is real and now has a pattern:** main-process writes to gamesDb MUST be broadcast to the renderer (`gamesDb:changed`), or App's whole-array persist clobbers them. Any future main-side store write to renderer-owned state needs the same treatment.
- **The reconcile scan is bounded to root + 2 levels and month-named level-2 dirs** — deeper or oddly-named structures won't adopt (deliberate; don't "fix" without a real case).
- `RL 2026-07-15.mp4` ghost: its row points into a `Vertical Recordings Onwards\2026-07\` folder that no longer exists — expected, cleans up with the rest.
- Old prod DB twin at `<repo>\data\clipflow.db` (source-run era) is stale but harmless — do NOT commit it (never `git add -A`).
- Adoption sets original_filename = current filename (OBS name unknowable) and probes duration via ffmpeg; a probe failure leaves duration null (cosmetic).
- The `tasks/mocks/*` untracked files from earlier sessions remain untracked — leave them.

## Logs / Debugging
- **Reconcile log lines** (`reconcile` scope, electron-log): `Adopted untracked file: <path>`, `Reconcile: N missing, M adopted`, `Repaired impossible day counter for <TAG>: dayCount X→Y, lastDayDate A→B`, `Removed N missing-file row(s) from the library`.
- **Library pin:** `Pinned projectsRoot to <path>` (system scope) on first launch after install — appears exactly once per profile.
- **Silent-create canary:** RenameView now logs `fileMetadataCreate failed: <err>` to console AND shows a visible warning banner if a rename's DB write fails.
- **Verification evidence:** sandbox run in session scratchpad (gone next session); durable record = #170/#171 comment threads + CHANGELOG session-113 entry + this file. Screenshot showed: cleanup notice + March 2026 with Day6 + adopted Day7; post-rename disk listing showed in-place `RL 2026-07-17 Day8 Pt1.mp4`.
- **CDP recipe held** (session-112 notes): `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`, node + global WebSocket, `Runtime.evaluate` awaitPromise/returnByValue; GroupedSelect dropdowns open via their `<button>` (not the div); `taskkill //F //IM electron.exe` to end (never TaskStop).
