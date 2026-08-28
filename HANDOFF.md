# HANDOFF — Session 218 (2026-08-28)

## Current State

**Session 5 of the approved 8-request plan is done: lightweight publish mode (#329) is on
master.** The scheduled-publish loop no longer lives in the renderer. The 60s tick, the claim
and the per-platform orchestration are in `src/main/publish.js` — a file that until now held
four dead stubs — so publishing works with no window in existence.

**Streaming mode ships with it.** Settings → Publishing → "Keep publishing while I stream",
**off by default**. On, closing the window destroys the renderer and leaves the main process
behind a tray icon; scheduled clips keep going out. Off, close still quits, exactly as before.
**CLAUDE.md Key Design Decision #2 is formally amended**, not silently deviated from.

**Measured, not claimed:** 474 MB → 334 MB entering streaming mode (−30%), renderer process
gone entirely (133 MB → absent). Second run agreed (494 → 336 MB). The **GPU process does not
retire** — ~119 MB across samples at t+20/40/60s with no window. Filed as
[#332](https://github.com/Oghenefega/ClipFlow/issues/332) rather than papered over.

**Still not in an installer.** The live feed is `0.4.0-alpha.9`. **Five** issues now sit behind
one cut: #325, #324, #331, #328 and #329. This is well past a natural cut point.

**Two things Fega needs to know** (both in the session summary, repeated here):
1. **His running daily driver was terminated** by a broad `taskkill //F //IM Corva.exe` during
   packaging verification. No data loss — the app persists on every change — but he has to
   reopen it. Before that, at 16:30, it published the GTA 6 clip on schedule (TikTok +
   Instagram + YouTube all succeeded) through the OLD renderer scheduler.
2. **`npm start` is now a publishing action.** See Watch Out For.

## Key Decisions

1. **Destroy the renderer, don't hide it.** Fega's call. Hiding stops Chromium painting but
   leaves the whole renderer resident, and the memory is the point. Cost is a ~2-4s relaunch
   from the tray. This is only safe *because* the scheduler is main-side.
2. **The dev profile refuses to auto-publish** unless `CLIPFLOW_ALLOW_DEV_PUBLISH=1`. Fega's
   call. s214 had a dev renderer publish to real accounts; with the scheduler running headless
   there is no window to notice it, so "dev does not auto-post" had to become code.
3. **`src/shared/` exists now.** The caption/tag resolvers and the tracker-row builder are the
   one thing both processes need identically. CJS exports, renderer imports named ESM bindings
   — the same arrangement `resolveSubtitles`/`wordRepair` already use. **`build.files` gained
   `src/shared/**/*`; verified in the packaged asar, not the glob.**
4. **Main is the sole author of publish-born Tracker rows, XP and training rows.** Not just
   because the scheduler needs it — because `trackerData` is persisted from `App.js` as a
   whole-array overwrite, so a row main appended while a window was open could be erased by
   that window's next save. Both `trackerData` and `xpLedger` are guarded by a pending-union
   map. The Queue's `logPost` routes through the same builder, so there is one row shape.
5. **The renderer's scheduler is deleted, not disabled.** Two schedulers racing is worse than
   none. `QueueView` lost five props it no longer needs.
6. **Platform publishers became named functions**, IPC handlers reduced to pass-throughs.
   Bodies lifted verbatim — same args, same returns, same `publishLog` writes.

## Next Steps

1. **Cut an installer.** Five `status: untested` issues are queued behind one, and #328/#329
   are the two most visible things Fega has been unable to see.
2. **Answer the open question in `tasks/lessons.md` S218:** should the scheduler refuse to
   auto-fire when running from source (`!app.isPackaged`)? It would make the mandatory
   verification ritual permanently safe, at the cost of his documented `npm start` backup path
   silently not publishing. Deliberately not decided unilaterally.
3. **#332** — reclaim the GPU process in streaming mode, or document it as a Chromium constraint.
4. Flip #325/#324/#331/#328/#329 off `status: untested` once he confirms on the installed build.
5. **Fega's call on the two half-published GTA clips from s214** (keep or delete), then
   reconnect YouTube and Retry. Still outstanding, still no response.

## Watch Out For

- **`npm start` now boots a live publisher on the PROD profile.** The mandatory "build +
  `npm start`" verification step runs prod, which holds real tokens; the scheduler starts and
  ticks within a minute. For publish-adjacent work verify with `CLIPFLOW_PROFILE=dev` (guarded)
  or the packaged exe against dev — never bare `npm start`. If a prod boot is genuinely needed,
  grep `clipflow-settings.json` for past `scheduledAt` values first and kill it the moment the
  boot assertion passes. Full write-up in `tasks/lessons.md` S218.
- **Never `taskkill //F //IM Corva.exe`.** It kills Fega's daily driver, not just the thing you
  launched. Target the specific PID, or use `electron.exe` (source runs) which is a different
  image name from the installed app.
- **`asar extract-file` with the repo as CWD overwrites `package.json`** with the stripped
  packaged copy — scripts, devDependencies and the whole `build` block gone. Memory
  `project_package_json_strip` documents this and it was committed anyway this session.
  Recovery is `git checkout -- package.json` plus re-applying any uncommitted change. **Use
  `npx asar list` and grep — never extract.** Note the list output uses BACKSLASHES
  (`\src\shared\...`), so a `grep "^/src"` finds nothing and reads as "it didn't ship".
- **`git checkout -- <file>` restores through autocrlf**, so an all-LF file comes back CRLF.
  `package.json` was LF, got restored as CRLF, and `git diff --stat` still said "1 insertion"
  because the diff normalises both sides. Byte-probe after any checkout of a file you then edit.
- **Two schedulers must never coexist.** `QueueView.js` carries a comment saying so at the site
  where the tick used to be. The Queue's manual Publish/Retry paths are still live and still
  claim through the same `projectClaimScheduledPublish`.
- **The main scheduler's publish payload comes from `claim.clip`, not the summary list.**
  `listProjects` strips `subtitles`/`transcription` but keeps everything else including
  `testMode` and `tags` (checked) — still, the claim re-reads the full clip from disk and that
  is what gets published, because a stale `renderPath` (#188 renames the file) fails every
  platform at once.
- **A scheduled auto-fire writes `scheduled: false` on its tracker row.** That is pre-existing
  behaviour preserved deliberately: the renderer's auto-fire path passed a null `scheduleOpts`,
  so it went through `logPostAtFirstSuccess`. The slot is still correct via `publishedAt`. If
  this is wrong it is a product decision, not a regression to fix silently.
- **`systemNotify` and `publishPreflight` now have zero renderer callers** — the deleted
  QueueView scheduler was their only user. Left in place rather than removed: the underlying
  `showNotification` / `preflightAccount` functions are live via the scheduler, and the
  codebase rule is to ask before removing things that merely look unused.

## Logs / Debugging

- **Is the scheduler running?** `grep -i scheduler` the profile's `logs/app.log`. Three lines
  matter: `Scheduler: started (main process, 60s tick)`, `Scheduler: dev profile — scheduled
  publishing disabled`, and `Scheduler: firing scheduled publish for "<title>"`.
- **Footprint numbers** are in the same log: `Footprint (before streaming mode)`,
  `(streaming mode)`, `(streaming mode tick)`, `(window restored)` — `app.getAppMetrics()`
  grouped by process type. This is the only readout that survives having no window.
- **Driving the scheduler without waiting 60s or touching the network:** it is dependency-
  injected precisely for this. Require `src/main/publish.js` in plain node, pass real
  `projects.js` pointed at a scratch tree plus fake `publishers`, and call the exported
  `tickOnce()`. Two harnesses in this session's scratchpad (`sched-harness.js`,
  `sched-success.js`) cover 33 assertions between them — claim, no-double-post, #60 test-mode,
  per-platform persistence, the #293 snapshot, and the #240/#306 training fences. Worth
  re-creating for any future publish change; they need no Electron and cannot reach a platform.
- **Proving a headless publish in the real app:** boot with `CLIPFLOW_PROFILE=dev
  CLIPFLOW_ALLOW_DEV_PUBLISH=1`, repoint dev `projectsRoot` at a scratch fixture tree (rewrite
  clip id AND title), arm one clip ~20s out, call `window.clipflow.streamingEnter()` over CDP,
  then watch the log. With dev tokens empty the run fails at "No platforms enabled" — which is
  the correct, safe proof that the tick, the claim and the orchestration all ran with zero
  renderer processes alive.
- **CDP dies when streaming mode engages** (that is the point). Verify by target count:
  `curl -s http://127.0.0.1:9222/json` returns `[]` with the renderer destroyed.
- **Dev tokens must read `{"accounts": {}}` before every boot.** Confirmed empty at session
  start, after every test, and at wrap. Never re-seeded.
