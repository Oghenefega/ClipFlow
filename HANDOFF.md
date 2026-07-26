# ClipFlow — Session Handoff

_Last updated: 2026-07-25 — Session 129 — **Instagram's upload endpoint can't take long 1080p clips; worked around from two directions. Version numbering retracted from 0.5 back to 0.3. Shipped as 0.3.0-alpha.16, .17 and .18.**_

---

## One-line TL;DR

Fega opened with an objection, not a task: the app had jumped 0.3 → 0.4 → 0.5 in two days off my own bump judgment, and he wanted it back on 0.3. That retraction led into an Instagram publish failure that turned out to be a genuine, undocumented platform limit — **Meta's upload endpoint gives itself ~33-35 seconds to process a completed upload and rejects anything slower, so a 1080p clip over ~55s cannot be published from ClipFlow at all.** Roughly 40 live uploads narrowed it down; resolution and duration are the only variables that matter. Also fixed: rendered files kept the `Clip N` placeholder when a clip was titled after rendering.

## Current State

**0.3.0-alpha.18** built and pushed — `dist\ClipFlow Setup 0.3.0-alpha.18.exe` (124 MB, 23:07). Fega installed .16 and .17 during the session and confirmed a real Instagram publish went through on .17; **.18 is not yet installed or confirmed.**

Three installers this session: `.16` (Instagram retry + render bitrate/audio), `.17` (720p button + title-driven filenames), `.18` (thumbnail-convention corrections).

Open: **#186** (a decision, not a task), **#187** shipped-untested, **#188** shipped-untested. **#185 closed.**

## What Was Just Built

- **Instagram uploads retry 3× with backoff** (`instagram-publish.js`) — fresh container each attempt (a failed one resets its offset to 0), 20s then 60s. Meta's `retriable: false` flag is demonstrably false: byte-identical files produced both outcomes. Recovers the 45-55s band, which was a coin flip on one attempt.
- **"Send IG a 720p copy" button** (#187) — appears beside Retry Failed *only* when the failed platform is Instagram, never pre-emptively. Makes a copy, publishes it to Instagram alone, deletes the copy on success. `retryFailed()` gained `{ restrictToKey, videoPath, qualityNote }` rather than duplicating its status/tracker/publish-log bookkeeping. Downscale caps the **shorter** dimension, so 8:9 and landscape sources scale correctly.
- **Render files follow the clip title** (#188) — renaming happens in `projects.updateClip`, the single choke point for clip mutations. Gated on the clip having a render, so detection candidates keep their `Clip N` identity. Thumbnails keep their own suffix convention.
- **Render changes:** bitrate ceiling 25 → 10 Mbps (0.9947 SSIM, files 43% smaller — Fega approved after a 100% side-by-side), audio 192k → 128k to match Meta's documented spec.
- **One-off backfill:** 24 existing files (12 videos + thumbnails) renamed to their titles across 8 projects. Undo log in the session scratchpad.

## Key Decisions

- **Version numbering reversed (Fega's call).** The session-103 delegation ("I'll leave it in your hand to know when we should bump a main number up") is dead. **Tick the alpha counter forever; the minor number never moves without Fega saying so.** 0.4.0-alpha.1 and 0.5.0-alpha.1 retracted, their exes deleted, both features recut as 0.3.0-alpha.15. Baked into the `clipflow-update-launcher` skill.
- **No automatic downscaling.** Fega refused it twice, including after seeing the evidence: ClipFlow renders 1080p and always attempts 1080p. The 720p copy exists only behind a click, and only after Instagram has already refused. He accepted a *bitrate* drop (same resolution) as a separate matter.
- **The button appears only after a failure**, not pre-emptively on long clips, even though clips over ~55s are near-certain to fail and the user eats a ~4 minute retry cycle first. Explicit choice — quieter interface wins.
- **Backfill restricted to rendered clips.** Detection candidates (~18 per project, 267 of them) keep `Clip N` and their `clip_<n>_thumb.jpg` artifacts. Fega was explicit that only clips he renders and queues should be renamed.

## Next Steps

1. **Get confirmation on 0.3.0-alpha.18** — specifically: retitle a rendered clip and check that both the video and its `_thumb.jpg` follow. That path was verified outside the app only. Then close #188.
2. **#186 is the real decision** — hosted `video_url` delivery is the only thing that makes 1080p work at any length. Two shapes written up on the issue: ClipFlow-hosted (Supabase Storage, works unattended, footage transits our infrastructure) vs. served from Fega's own machine over a temporary tunnel (file never leaves his disk, but only works while the app is running). Don't start either without his call.
3. **#187 needs a real failure to prove itself.** The button and its transcode are verified; the click path isn't, because triggering it means publishing to his account.
4. `Clip 1.mp4` in RL Day8 Pt6 was rendered but never titled — nothing to rename it to. Harmless, just don't be confused by it.

## Watch Out For

- **The Instagram limit is real and undocumented.** Do not re-litigate it with encoder settings. Measured and dead: bitrate 18 → 1.8 Mbps, frame rate 60/30, codec H.264/HEVC, edit lists present/stripped, audio 192/128/96k, single-shot vs chunked upload, file size 123 MB → 13.5 MB. **All fail at 1080p/57.2s.** 720p and 540p pass; ≤40s passes; 45-55s is a coin flip. Full table on #185's comment thread.
- **Chunked upload does not help** and it's tempting to think it would. The pieces are accepted in under a second each (`HTTP 206 / PartialRequestError / retriable: true`), then the final piece triggers processing and hits the same 34s wall. Verified directly.
- **Projects do NOT live under `watchFolder`.** They live under the `projectsRoot` setting — currently `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects`, a different tree from the watch folder. `main.js:177` resolves `projectsRoot || watchFolder`. This cost a false start; any script touching project data must read that setting, not assume.
- **Three thumbnail conventions exist and are not interchangeable:** `<render name>_thumb.jpg` (`main.js:2899`, paired to the video filename), `<clip id>_repairthumb.jpg` (`render-collision-repair.js:110`, keyed by id on purpose), `<title>_thumbnail.png` (`main.js:3013`, the WYSIWYG screenshot — a different feature). I shipped a rename that flattened them into one and had to correct it in .18.
- **Close ClipFlow before any script that rewrites project JSON.** The app holds projects in memory and will write stale paths back over an external edit — producing a renamed file the app can't find, which surfaces later as a failed publish rather than an obvious error.
- **`git add` explicitly, never `-A`:** `data/clipflow.db` is permanently dirty from runtime churn, and `.agents/`, `.codex/`, `AGENTS.md`, `tasks/mocks/*` are untracked pre-existing files.

## Logs/Debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log` (prod), `%APPDATA%\clipflow-dev\logs\app.log` (dev). Instagram publishing logs under the `(instagram)` scope — `Starting publish` carries `sizeMB`, and `Publish failed` carries Meta's raw error body. Correlating outcomes against `sizeMB` across `app.log` + `app.1.log`…`app.5.log` is what first showed the same file failing and later succeeding.
- **Probing Instagram without publishing:** `scratchpad/ig-probe.js` — an Electron entry point that decrypts the real token out of the prod profile (DPAPI, so it must run inside Electron), creates a media container, uploads bytes, and **stops before `media_publish`**. Nothing lands on the account; unpublished containers expire on their own. Modes: `control` / `small` / `file <path>` / `chunkfile <path> <chunkMB>`. Run with `npx electron <script>`.
- **Reading a token outside the app:** tokens are in `%APPDATA%\clipflow\clipflow-tokens.json`, base64 of a DPAPI blob — `safeStorage.decryptString(Buffer.from(acct.accessToken, "base64"))`, which requires `app.whenReady()` and `app.setPath("userData", …)` pointed at the right profile first.
- **Booting the app beside the daily driver:** the single-instance lock is per profile, so `CLIPFLOW_PROFILE=dev npx electron .` runs while the installed `ClipFlow.exe` is open. `isDev` is hardcoded `false`, so it loads the **built** `build/` output — build first. Kill with `taskkill //F //IM electron.exe` (only matches the dev instance; the installed app is `ClipFlow.exe`).
- **Verifying an installer really contains a change:** read the asar bytes directly rather than trusting `build.files` — `fs.readFileSync('dist/win-unpacked/resources/app.asar').toString('latin1').includes('<needle>')`. Never `asar extract-file` from the repo root; it overwrites `package.json` with the stripped packaged copy.
- **Scratchpad scripts from this session:** `ig-probe.js` (upload probe), `ig-retry-verify.js` (drives the real `publishReel` to prove the retry loop), `verify-188.js` (18 assertions on `updateClip` renaming, throwaway watch folder), `verify-187.js` (11 assertions on the transcode), `backfill-names.js` (dry-run / `--apply` / `--undo`), `breakdown.js`, `audit-after.js`.

## Verification Status

**Verified:** the retry loop against the live API (3 attempts, correct backoff, never reaches publish while failing); ~40 upload probes establishing the limit; a real Instagram publish through the refactored path (Fega's 720p post landed, which also closed the "success path unexercised" gap from .16); 18 assertions on the rename logic; 11 on the transcode (geometry, duration, audio, landscape, delete guard); the backfill audited afterwards — 21/21 rendered clips resolve on disk, zero dangling paths; all three installers grepped in the asar.

**Not verified:** the 720p button's click path in the UI (needs a real Instagram failure); retitling a clip inside the running app; and 0.3.0-alpha.18 has not been installed by Fega yet.
