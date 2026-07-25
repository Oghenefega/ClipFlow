# ClipFlow — Session Handoff

_Last updated: 2026-07-24 — Session 126 — **Root-caused the clip that published twice to all four platforms: two ClipFlow instances running at once. Fixed the symptom (disk-arbitrated schedule claim + `publishedAt`) and the cause (single-instance lock). Two installers cut; alpha.14 is the one to install.**_

---

## One-line TL;DR

Fega reported the "I chickened out literally #eggingon" clip going out twice across social media. The publish log confirmed two complete 4-platform runs 15 minutes apart, distinct post IDs, same video file. Root cause: **two ClipFlow instances running concurrently** — the installed exe plus a source `npm start`, both on the prod profile — proven by interleaved per-launch session IDs in `app.log` (six launches spanning alpha.9→alpha.12 overlapped during yesterday's installer churn). The auto-fire scheduler lives in the renderer and both its dedup guards were process-local, so when one instance published and cleared `scheduledAt` on disk, the other was still working from a clip list loaded minutes earlier, saw the clip as due, and posted it again. Shipped both halves: firing now goes through `projects.claimScheduledPublish` (main process re-reads from disk and clears `scheduledAt` in one synchronous read-modify-write, so exactly one caller wins) plus a durable `publishedAt` stamp the claim refuses; and `app.requestSingleInstanceLock()` so two copies of a profile can't coexist at all.

## Current State

- **Installed daily driver: 0.3.0-alpha.12** (unchanged this session unless Fega has since installed). **`dist\ClipFlow Setup 0.3.0-alpha.14.exe` is cut and waiting** — install that one; it supersedes alpha.13.
- Master clean and pushed through `d293273`.
- **alpha.13 exists but is superseded.** It carried the publish fix but was cut minutes before the lock landed. alpha.14 has both. Old installers in `dist/` are harmless (the notifier uses newest mtime) — but see the notifier caveat under Watch Out For.
- **#156 and #182 both still OPEN** — deliberately. The fix is unverified against a real scheduled post; close them only once Fega confirms one fires exactly once. Status comments are already on both.
- **Carried over from session 125, still unresolved:** the "I finally made this Difficult jump" reel (posted 2026-07-24 ~14:43, post_id `1079234704765331`) needs **non-zero views after 24h** to close the Facebook zero-views saga. Check 2026-07-25; the FB Reels task in `tasks/todo.md` stays "awaiting verification" until then.
- The duplicate posts from yesterday are still live on all four accounts — **Fega explicitly decided not to delete them. Don't raise it again.**

## What Was Just Built

- **`projects.claimScheduledPublish(watchFolder, projectId, clipId)`** (`src/main/projects.js`) — the single arbitration point for auto-fire. Re-reads the clip from disk, refuses if `publishedAt` is set / no longer scheduled / not yet due, and clears `scheduledAt` inside the same synchronous load-modify-save. `loadProject`/`saveProject` are both sync, so no other claim interleaves. Returns the live `scheduledAt` on refusal so a stale renderer can resync. Exposed as `project:claimScheduledPublish` IPC + `projectClaimScheduledPublish` on the preload bridge.
- **Scheduler rewired** (`QueueView.js` ~641) — fires only on a won claim; on refusal it logs the reason and resyncs its in-memory copy to what disk reports.
- **`publishedAt` stamp** — written in BOTH publish paths (`publishClip` and `retryFailed`) on the *first* real platform success, not after the loop, so a crash mid-upload can't leave the clip eligible to fire again. Scheduling a clip clears it, so deliberate reposts still work.
- **Manual publish disarms the schedule (#182)** — `publishClip` clears `scheduledAt` up front. Previously "Publish now" left it armed to fire again at its original slot; that alone double-posts with a single instance running.
- **Single-instance lock (#156)** (`main.js`) — `app.requestSingleInstanceLock()` + a `second-instance` handler that restores/shows/focuses the existing window.
- Two installers cut (alpha.13, then alpha.14 once the lock landed).

## Key Decisions

- **`publishedAt` as the dedup signal, not "publishState has a success".** `publishState` is per-platform history the UI needs for retry; overloading it would have broken retry-of-partial-failure. A separate stamp keeps the concerns apart. Scheduling clears it, making it "armed for this cycle" rather than "ever published" — without that, the guard permanently blocks reposts.
- **Arbitration in the main process, not the renderer.** A renderer-side "re-read then decide" still races across processes. Main-process load-modify-save with sync fs calls shrinks the window to one function body. Verified with a 17-case harness: five simultaneous claims → exactly one winner.
- **The lock goes AFTER the profile redirect in `main.js`, and this is load-bearing.** Electron's lock is scoped to the `userData` directory. Requesting it before `app.setPath("userData")` would make dev and prod contend for one lock and break `npm run dev` alongside the installed app. As placed, only same-profile launches collide — exactly the pair that caused the incident. **Do not reorder.** The ordering assertion (setPath < lock < Sentry require) is worth re-running if that region is touched.
- **`app.exit(0)`, never `app.quit()`, for the losing instance.** `quit()` is async, so the loser would keep loading Sentry, the DB, the stores and migrations before dying. `exit(0)` halts synchronously — probe-verified.
- **The lock was initially left OUT of scope, then added on Fega's explicit ask.** Worth noting *why* it was nearly skipped: the downside was overstated from recall (see lessons.md session 126). The publish fix stands on its own; the lock is about shared DB/settings state.
- **Version sizing: alpha ticks for both cuts.** User-facing these are "clips don't get posted twice" and "the app won't open twice" — behavioural fixes, not new capabilities, however much of the scheduler was rewritten.

## Next Steps

1. **Install `dist\ClipFlow Setup 0.3.0-alpha.14.exe`.** Close ClipFlow fully first — the running alpha.12 doesn't check the lock, so it holds none and a new copy wouldn't detect it. Protection starts from the first alpha.14 launch.
2. **Verify one real scheduled post fires exactly once**, then close #156 and #182. Watch for `[Scheduler] Firing scheduled publish` (fired) vs `[Scheduler] Skipping … Already published` (correctly refused).
3. **Check the FB reel's view count on 2026-07-25** (post_id `1079234704765331`) — last open item of the zero-views saga.
4. Code backlog otherwise unchanged — run the start-session issue list for the current picture.

## Watch Out For

- **The `publishClip` guard re-clears `scheduledAt` redundantly on the auto-fire path.** `clip` there is a pre-claim render snapshot, so `clip.scheduledAt` still looks set even though the claim already nulled it on disk. Idempotent write, deliberately left alone — the code comment says so. Don't "fix" it by threading the live value through without a reason.
- **`publishedAt` has no backfill.** Clips published before this change have `publishState` successes but no stamp. Verified at implementation time that zero clips on disk were both scheduled AND already published, so exposure was nil — but a clip found in that state would be allowed to fire.
- **Two publish paths, not one.** `publishClip` AND `retryFailed` both upload and both needed the stamp. Future changes to publish bookkeeping must touch both or the guard grows a hole.
- **`npm start` shares the prod profile with the installed app** — same `%APPDATA%\clipflow\`, same project library. Post-lock this is blocked rather than silently dangerous, but pre-alpha.14 builds still stack.
- **The dev profile shares the real project library.** `CLIPFLOW_PROFILE=dev` isolates `userData` only; `projectsRoot` still points at `W:\...\Vertical Recordings Onwards\.clipflow\projects`. Don't schedule or publish from a dev instance while testing — it writes real project JSONs.
- **The update notifier compares version-string inequality, newest-by-mtime** (main.js `update:check`) — it will offer ANY different version, including a lower number. Delete retracted installers from `dist/`.
- **Never run `asar extract-file` with the repo as CWD.** It writes the extracted file into the working directory — extracting `package.json` overwrites the real one with the *stripped* packaged copy (no `scripts`/`build`/`devDependencies`, 106→90 lines) and breaks every npm command. This is the long-standing "something strips package.json" mystery from session 85, now identified. Grep the asar bytes instead (`fs.readFileSync(asar,'latin1')` + substring counts) — faster anyway, and how alpha.14's contents were verified.

## Logs/Debugging

- **`app.log` is LOCAL time (EDT); `clipflow-publish-log.json` timestamps are UTC (`…Z`).** A 4-hour offset that cost real time this session — publish-log entries at `17:16Z` are `13:16` in `app.log`, and matching the raw numbers points at a completely different clip. Convert before correlating.
- **Interleaved session IDs are the tell for concurrent instances.** `sessionId` is minted once per app launch (`src/main/logger.js:31`, `crypto.randomBytes` at module load), so if `sess_A` keeps logging *after* `sess_B` logs "App started", two processes are alive. Sweep:
  `grep -nE "^\[2026-07-24 1[2-5]:" app.log | awk -F'sess_' '{print $2}' | cut -c1-12 | uniq -c` — repeated blocks of the same ID mean interleaving.
- **`App started` lines carry the version**, which is how the alpha.9/.10/.11/.12 overlap was established.
- **Publish audit trail: `%APPDATA%\clipflow\clipflow-publish-log.json`** (electron-store, last 500 entries) — clipId, title, platform, account, status, and platform post/publish IDs. This proved two distinct uploads rather than a logging artifact.
- **`src/main/publish.js` is DEAD CODE** — four stubs returning "not yet implemented". Real publishing lives in `src/main/oauth/{tiktok,instagram,facebook,youtube}-publish.js`. Don't read `publish.js` when tracing a publish bug.
- **Forensic anchors for this incident:** first run at `13:15:57`–`13:16:35` local (`sess_baffbecbb341`), second at `13:30:30`–`13:31:11` (`sess_44f55de0b1b4`); "I finally made this Difficult jump" fired five times (12:30, 13:08, 14:30, 14:35, 14:42). The 12:30 failures are the already-fixed #181 collision damage ("Video file not found … Clip 3.mp4").
- **Useful sweep for at-risk scheduled clips** (reads the real library via `projectsRoot`/`watchFolder` from `clipflow-settings.json`): walk `<root>\.clipflow\projects\*\project.json` and report clips with `scheduledAt` set, flagging any that also have a `publishState` success. Returned 0 at implementation time.
- **Probe technique worth reusing:** to settle framework-behavior questions (lock scoping, whether `app.exit(0)` halts), a ~10-line throwaway Electron main script run twice with different `userData` paths answers in minutes. Pattern in this session's scratchpad.
