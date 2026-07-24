# ClipFlow — Session Handoff

_Last updated: 2026-07-24 — Session 125 — **Facebook Reels publishing (the zero-views fix) + render filename collision prevention AND one-time repair (#181); three installers cut, Fega on 0.3.0-alpha.12 with the fix chain verified end-to-end in production logs.**_

---

## One-line TL;DR

Built the queued Facebook Reels task (Wick's spec: three-phase `video_reels` flow adapted from instagram-publish.js, 3–90s duration router with the legacy `/videos` path as silent-but-logged fallback, `surface` in the publish log, real `facebook.com/reel/<id>` links into platformResults) — then, mid-verification, Fega's scheduled publish failed and exposed a much older bug: render filenames come from the clip title (default "Clip N") written into ONE flat shared folder, so clips from different projects overwrote and deleted each other's files (his EO clip's file was killed by an RL project's render+delete; wrong-game thumbnails everywhere). Shipped prevention (per-project subfolders + render-time collision guard, `resolveRenderOutputPath` in main.js) AND a one-time boot repair (`render-collision-repair.js`: 12 untrusted render records reset, 14 thumbnails regenerated from each clip's own source recording — dry-run on a copied library first, then live with backup). **Fega installed alpha.12, re-rendered + published the EO clip: logs show the render in its per-project folder and Facebook returning `surface: "reels"` with a real post_id. #181 closed verified.**

## Current State

- **Installed daily driver: 0.3.0-alpha.12.** Carries FB Reels publishing, collision prevention, and the record repair (repair already ran + flagged done, so its boot pass no-ops).
- Master clean and pushed through `0ad5d31` (+ this session-end commit).
- **#181 closed, Fega-verified.** Collision map reports zero shared filenames; backup of pre-repair project JSONs at `W:\...\Vertical Recordings Onwards\.clipflow\projects-backup-pre181\`.
- **The ONE remaining check of the whole zero-views saga:** the "I finally made this Difficult jump" reel (posted 2026-07-24 ~14:43, post_id 1079234704765331) shows **non-zero views after 24h**. Everything else passed; this is the check that proves distribution. The FB Reels task in tasks/todo.md stays "awaiting verification" until then.
- Version note: 0.3.1-alpha.1 was briefly cut and RETRACTED (wrong sizing — see Key Decisions); alpha.10/alpha.11 were cut but never installed, superseded by alpha.12.

## What Was Just Built

- **facebook-publish.js rewrite** — `publishReel` (start → rupload binary → finish, page token, v21.0), `publishLegacyVideo` (old multipart path, intact), `publish` router (ffprobe duration, 3–90s inclusive → Reels, outside/probe-fail → legacy). Error codes 613/6000/190/100/200 → plain-language messages. Raw status + finish responses logged (Meta's real shapes confirmed in production: status has `video_status`/`uploading_phase.status`; finish returns `{success, post_id}`).
- **main.js `facebook:publish` handler** — returns `postId`/`surface`/`url`; publish log records `surface`.
- **QueueView (both publish sites)** — `result.url` preferred for platformResults links (YouTube fallback unchanged); `postId` chain now includes camelCase.
- **main.js render pathing (#181 prevention)** — `renderOutputDir` + `resolveRenderOutputPath`; render:clip, render:batch, and thumbnail:capture all scope outputs to `<outputFolder>\<project name>\`; collision guard suffixes " (2)" unless the path is the clip's own renderPath; paths resolve lazily at job run time (thunk through enqueueRenderJob) so same-titled clips in one batch can't clobber each other.
- **render-collision-repair.js (#181 repair)** — one-time, store-flag `renderCollisionRepairDone`, same pattern as the #84 subtitle repair. Flat-folder renderPaths shared-or-dangling → pending; shared thumbnails → nulled then regenerated in background from `project.sourceFile` at `clip.startTime+1` into the project's clips dir (`<clipId>_repairthumb.jpg`).

## Key Decisions

- **Duration fallback is Fega's locked call** (spec): outside 3–90s posts as a normal video, silent-but-logged, never fails the multi-platform batch. No Reels-error → legacy-retry fallback (double-post risk); routing is by duration only.
- **Version sizing corrected by Fega, twice-refined:** the FB fix is user-facing "Facebook posting works correctly now" → alpha tick, NOT a minor bump (0.3.1-alpha.1 retracted, installer deleted). And 0.3 itself predates this session (Rename redesign, session 117) — Fega considered rolling back to 0.2.x, then decided to stay on 0.3. Rule now in clipflow-update-launcher + memory: size by what the user gets, not implementation novelty.
- **Repair distrusts, never guesses ownership:** any flat-folder render file claimed by >1 clip (or missing) is untrusted → record reset; files on disk, publish history, tracker all untouched. Thumbnails regenerate from the clip's own source recording — the one origin that can't carry another project's content.
- **deleteClipRender still keeps the thumbnail** (session-123 "list identity" choice) — safe now that paths are per-clip; deliberately NOT changed.
- **No mass re-render homework for Fega:** reset clips re-render lazily, only if/when he publishes them again.

## Next Steps

1. **Tomorrow: check views on the "Difficult jump" Facebook reel.** Non-zero = the zero-views saga is closed end-to-end (both causes: app Live mode + Reels surface). Then mark the FB Reels task DONE in tasks/todo.md.
2. Spec's flagged future win (out of scope this session): Facebook native scheduling (`video_state=SCHEDULED`) would fire FB posts without the app open — worth a ticket when scheduling comes up again.
3. Spec footnote: `business_management` scope in meta.js:42 is heavier than page posting needs — only revisit if a reconnect hits friction.
4. `projects-backup-pre181` folder can be deleted once Fega's happy everything looks right (ask him first — it's his safety net).

## Watch Out For

- **Legacy flat-folder files still exist** (old renders + orphaned thumbs like the RL-content `Clip 3_thumb.jpg`). Harmless — nothing references untrusted ones anymore — but don't "clean up" the renders folder without checking references; uniquely-claimed legacy records still point there.
- **Old clips re-rendered post-fix migrate paths silently:** their new render lands in the per-project subfolder while the stale flat file stays behind. Expected, not a bug.
- **The update notifier compares version-string inequality, newest-by-mtime** (main.js `update:check` ~3390) — it will offer ANY different version, including a lower number. Retracted installers must be deleted from dist/ (0.3.1-alpha.1 was).
- **Reels finish returns before Facebook finishes processing** ("Video is Processing" message) — success + post_id is the accepted contract; don't add post-finish polling unless a real failure shows up.
- **`npm start` (source, prod profile) shares the REAL settings store and W: projects tree** — a boot smoke runs migrations/repairs against real data. Deliberate this session (backup first); remember it before adding future boot-time repairs.

## Logs/Debugging

- Main log: `%APPDATA%\clipflow\logs\app.log`. This session's forensic anchors: RL publish of shared path Jul 14 13:30 (`app.log:33628`), EO failed publishes Jul 24 12:30/13:08 ("Video file not found"), successful Reels publish Jul 24 14:43 (`surface:"reels"`, videoId 1373136057662973, postId 1079234704765331).
- `#181 render collision repair:` / `#181 thumbnail regen complete:` log lines confirm the repair pass (12 reset, 14/14 regenerated).
- Facebook publish scope is `(facebook)`; first-run raw responses logged at "Reels status raw response" / "Reels finish raw response".
- Diagnosis tooling that worked well: collision-map script + repair dry-run live in this session's scratchpad (pattern: copy project JSONs, mock store, stub ffmpeg's electron logger dep).
