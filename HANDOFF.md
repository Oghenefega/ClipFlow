# HANDOFF — Session 187 (2026-08-24)

## Current State

**Batch 1 of the four fix batches is done, committed and pushed — `20dc133` on master.**
Three data-loss defects fixed: #297, #298, #299. All three are still **OPEN on GitHub by
design** — Fega has not seen any of them in the app, and per the repo convention closing is
his call. A fix note carrying the verification evidence is posted as a comment on each.

**No installer was cut.** The installed app on desktop and laptop is still 0.4.0-alpha.4 and
does **not** have these fixes. Per the batch-versions convention, one installer covers
batches 1–4 at the end.

`npm run build:renderer` exits 0; `build/` is current with master. The app boots clean on the
dev profile (`CLIPFLOW_PROFILE=dev`).

## What Was Built

### #297 — the editor no longer reports a failed save as a success

`_doSilentSave` (`src/renderer/editor/stores/useEditorStore.js`) cleared `dirty` on the
strength of a resolved promise. `project:updateClip` **returns** `{ error }` rather than
throwing, so a locked `project.json`, a full disk or a pulled drive read as a clean save and
the work vanished with nothing on screen.

- The store now requires `res.clip` back from disk before marking anything clean; otherwise it
  keeps `dirty: true`, sets the new `saveError` state and returns `false`.
- New sticky **Not saved — …** banner beside the Save button in the editor topbar, with
  **Retry** (`EditorLayout.js`). It clears only when a save actually lands.
- `describeSaveFailure()` turns errno text into a sentence a creator can act on
  (EPERM/EACCES/EROFS, EBUSY, ENOSPC, ENOENT). Anything unrecognised passes through verbatim.
- Callers that assumed success now stop: Save no longer flashes "Saved!", **Back** and
  clip-switch keep you on the clip, render/queue abort, and duplicate-clip aborts
  (`TimelinePanelNew.js`). `useAIStore`'s "Applied" badge already checked the boolean — it
  simply never got a truthful answer, so it starts working for free.

### #298 — a failed boot can no longer leave an invisible zombie holding the lock

- `app.whenReady().then(...)` finally has a `.catch()`. It and `uncaughtException` both go
  through one new `fatal(context, err)` in `main.js`: electron-log, `Sentry.captureException`,
  a modal `dialog.showErrorBox("Corva has to close", …)` naming the error and the log folder,
  then `app.exit(1)` so the single-instance lock is released.
- `uncaughtException` no longer re-throws (which had been suppressing Electron's own dialog).
  EPIPE is still ignored.
- `store-factory.js` parses each store file before instantiating; an unreadable one is renamed
  to `<name>.json.corrupt-<timestamp>` (kept, never deleted) and the store starts on defaults,
  with `clearInvalidConfig: true` as a second line of defence. Covers settings, tokens and the
  publish log.

### #299 — crash-safe writes

- New `src/main/atomic-write.js`: temp file → `fsync` → rename over the target, with an
  optional backup path that demotes the replaced file **by rename, not copy**. If the swap is
  refused it removes the temp file and renames a demoted original back — the folder is left
  exactly as it was.
- `database.save()` uses it with `clipflow.db.bak`.
- `database.init()` → `_openOrRecover()`: probes every candidate with a real query (a truncated
  file survives `new SQL.Database()` and only throws on first read), falls back to `.bak` when
  the primary is unreadable **or missing mid-swap**, quarantines the damaged file as
  `clipflow.db.corrupt-<timestamp>`, logs each step, and never throws.
- `saveProject()` and `createProject()` in `projects.js` use the same atomic write.

## Key Decisions

1. **`project:updateClip` still returns `{ error }` rather than throwing.** Every other caller
   in the app reads that shape; the renderer was the side that was wrong, so the check went
   there.
2. **`app.exit(1)`, not `app.quit()`, in `fatal()`.** `quit` runs `window-all-closed`, which
   calls `database.close()` → `save()` — flushing a half-initialised database over a good file
   is exactly the failure this batch exists to prevent.
3. **Corrupt store files are quarantined, not cleared.** The ticket asked only for
   `clearInvalidConfig: true`; on its own that silently vaporises a user's settings. The file
   is kept alongside.
4. **The `.bak` is produced by the swap itself.** A copy-per-save would grow with the corpus —
   the exact property that makes #299 dangerous in the first place.
5. **errno text is translated, not hidden.** The code stays in the message (`… (EPERM)`) so a
   tester's screenshot is still diagnosable.
6. **Nothing closed on GitHub.** Unverified by Fega; fix notes posted as comments instead.

## Next Steps

**Batch 2 — nothing of mine ships in the build.** Ordering constraint stands: **#301 must land
before that gateway token reaches anyone**, because afterwards the fix can only travel by the
very path the defect breaks.

- #301 — resolve the gateway token at call time instead of seeding it as a store default, plus
  a one-time migration clearing any persisted copy.
- #302 — delete `"Fega"` from both Whisper `initial_prompt` arrays (`stable-ts.js:123`/`:229`);
  rename the **display name** of the `fega-default` template but **NOT its id**; align
  `App.js:326-330` caption seed with `STORE_DEFAULTS`; neutralise the default schedule and
  `weeklyTarget: 48`.

**Batch 3 — recordings that aren't mine still work.** #62 (`energy_scorer.py:337-339` exits 1
on digital silence), #300 (MKV accepted by the watcher, `.mp4` appended blindly at
`RenameView.js:784`), #178 (ALAC/PCM silent in the preview). #178 and #300 share a root shape —
the `<video>` has no `onError`, so a decode failure is invisible. Add that regardless.

**Batch 4 — the first ten minutes don't look broken.** #153 (fake WATCHING badge), #74
(pipeline internals on the most-watched screen — **needs Fega to approve replacement copy**,
that is the long pole, not the code), #152 (one un-confirmed click deletes a project folder).

**Then cut ONE installer** covering all four batches (~14 issues).

Optional batch 5 if there is room: #157, #151, #158.

## Watch Out For

- **A script-driven source edit can silently corrupt an escape.** This cost most of the
  session: a patch script's word-boundary escape landed as a literal 0x08 byte inside a regex,
  which compiled, minified, shipped and matched nothing, while `git diff`, `grep` and `sed` all
  rendered it invisibly. After ANY node/sed patch of a source file, scan changed files for
  control characters (char code under 32, excluding tab/CR/LF) before building. Distilled into
  `clipflow-code-review` and memory `feedback_bash_backslash_collapse`.
- **Known gap on #297:** quitting the app outright while the banner is up still loses that
  edit. Every in-app exit is guarded; a process kill cannot be.
- **The assume-success pattern was only audited inside the editor.** Clip writes from other
  surfaces (Projects rail, Queue) were not reviewed and may still fail silently.
- **`clipflow.db.bak` is new and is rewritten on every save.** Do not confuse it with the
  manual `clipflow.db.bak-20260805-pre239` sitting in the same folder.
- **The dev profile's `projectsRoot` was repointed at a scratch fixture during testing and
  restored** to the Vertical Recordings library on W: — verified afterwards (36 projects
  listed, the real `project.json` mtimes untouched). If the dev app ever shows one project,
  that setting is the first thing to check.
- **Untracked files still pre-date all this** and were again left alone: `.agents/skills/`,
  `.codex/`, `AGENTS.md`, `tasks/mocks/*`.
- **Wick still has an open decision** in his inbox (publish scope A or B) plus three
  Cloudflare/provider dashboard checks for #56.

## Logs / Debugging

- **App log:** `%APPDATA%` → `clipflow/logs/` (prod is still the legacy dir — #288).
  Dev profile: `clipflow-dev/logs/`.
- **New log lines worth grepping** (all in `app.log`):
  - `(database) … is unreadable:` — the primary DB failed its read probe.
  - `Damaged database kept at …clipflow.db.corrupt-…` — quarantine path, kept for salvage.
  - `Recovered from …clipflow.db.bak` — booted off the backup; anything written since the last
    good save is gone.
  - `Primary database is missing but a backup is present.` — a crash inside the swap.
  - `(store) …json was unreadable (…) — kept a copy at …` — settings/token/publish-log
    quarantine.
  - `(system) Corva couldn't finish starting up.` — the new bootstrap catch, with the stack.
- **Publish errors still live in `clipflow-publish-log.json`, NOT `app.log`.**
- **Reproducing the batch-1 tests** (all on the dev profile, app closed for the file edits):
  - Save failure: `fs.chmodSync(<project.json>, 0o444)`, edit in the editor, expect the banner.
  - DB recovery: truncate `clipflow.db` to ~40 KB, or delete it while `.bak` exists, relaunch.
  - Settings self-heal: truncate `clipflow-settings.json` mid-string, relaunch.
  - Bootstrap failure: temporarily `throw` just before `createWindow()`, relaunch.
- **Driving the app for verification:** launch
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion`,
  then drive it over CDP (`ws` is not installed; Node 24's global `WebSocket` works).
  `isDev` is hardcoded `false`, so this loads the built renderer — no Vite needed. A throwaway
  projects library (copy one `project.json` into `<scratch>/.clipflow/projects/<id>/` and point
  `projectsRoot` at it) keeps destructive editor tests away from the real library.
- **A modal `showErrorBox` cannot be dismissed with SendKeys/AppActivate** (Windows blocks the
  focus steal). Post `WM_CLOSE` to the dialog HWND via UIAutomation + `PostMessage` instead;
  UIAutomation also reads the dialog text back for evidence.
- **Kill the dev app with `taskkill //F //IM electron.exe`** (double slash) before any
  relaunch-based assertion — a single slash is path-mangled in Git Bash and kills nothing.
