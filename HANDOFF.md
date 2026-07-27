# ClipFlow — Session Handoff

_Last updated: 2026-07-26 — Session 130 — **Instagram now falls back to 720p by itself when the full-size render is refused. Shipped as 0.3.0-alpha.19.**_

---

## One-line TL;DR

Fega reversed a decision he'd made the day before: the 720p Instagram fallback from #187 shouldn't need a button press, it should happen automatically — on the condition that every occurrence is recorded so he stays aware of it. Built as **#189**, entirely inside the publish handler so manual publishing, Retry Failed and the auto-fire scheduler all inherit it. Cut as **0.3.0-alpha.19** because the one remaining unverified piece — a real long clip failing at 1080p and landing at 720p — can only be proven from the installed app.

## Current State

**0.3.0-alpha.19** built and pushed — `dist\ClipFlow Setup 0.3.0-alpha.19.exe` (124 MB, 17:38). **Not yet installed or confirmed by Fega.**

Cut on a single change rather than the usual batch of ~10, deliberately and with that stated: everything testable without a live Instagram post was already covered, and the remaining gap needs the daily driver.

Open: **#189** (built, awaiting a live post), **#186** (a decision, not a task), **#187** superseded by #189 but its button retained, **#188** shipped-untested.

## What Was Just Built

**#189 — automatic 720p fallback for Instagram** — `src/main/main.js`, `src/main/oauth/instagram-publish.js`, `src/renderer/views/QueueView.js`

- **The fallback itself.** Instagram refuses the full-size render → ClipFlow writes a 720p copy, publishes that, deletes the copy. Lives in the `instagram:publish` handler rather than the queue UI, so every caller inherits it without duplicated logic. Renders on disk are never touched; full quality is always attempted first.
- **Long clips fail faster.** Clips over ~55s that are larger than 720p get **one** full-quality attempt instead of three (`uploadAttempts` option on `publishReel`), cutting ~3 minutes of known-failure to ~1. Clips under 55s are completely untouched — full three-attempt ladder, never downscaled.
- **Gated on a `processingWall` tag** set at the specific failures a smaller file can actually fix (the rupload processing failure, a poll `status_code === "ERROR"`, a poll timeout). Auth/account/permission errors don't carry it and fail fast without a wasted encode.
- **Three records, since Fega is no longer the one clicking.** A persisted `720p` chip beside the Instagram checkmark on the queue card (`clip.downscaledPosts`, keyed by account key); both halves of the exchange in the Publish Log via `qualityNote`; a `logger.warn` line at the moment of the switch.
- **The live upload status line is finally rendered.** `publishProgress` had been collected from all four platforms since publishing was built and displayed nowhere. It now shows under the per-platform list while publishing — which is where the 720p switch announces itself as it happens.
- **Auth errors stopped lying.** "Could not process this clip after N attempts — long clips at 1080p are the usual cause" was being applied to every failure that exhausted the retry loop, including OAuth errors. That wording is now reserved for genuine processing failures.

## Key Decisions

1. **Automatic downscaling, reversing the position recorded one session earlier.** Session 129's changelog says outright: "ClipFlow will not quietly post a lower-resolution copy than what was rendered." Fega reversed it himself. The condition he attached was awareness, which is what the three records above are for. **Do not "restore" manual-only behaviour on the strength of the older note.**
2. **One full-quality attempt on long clips, not zero and not three.** Offered him three options; he picked the middle. Zero would mean never discovering if Meta fixes the wall; three is ~3 minutes of guaranteed failure on every long clip.
3. **The #187 button stays** as the escape hatch for when the automatic path itself fails. It will rarely appear now.
4. **The fallback lives in the main process, not the renderer.** The alternative was duplicating it into both `publishClip` and `retryFailed`; putting it in the handler also means the publish log gets both entries for free.
5. **Installer cut on one change**, against the usual batch-of-10 rule, because the success path is only provable from the installed app.

## Next Steps

1. **Install `0.3.0-alpha.19` and publish a >55s clip to Instagram.** Expected: one failed full-quality attempt (~1 min), the status line announcing the switch, the post landing, a `720p` chip on the card, two Publish Log entries, and no leftover `.ig720.mp4` beside the render. That closes #189.
2. **#186 still needs Fega's decision** — hosted delivery (hand Instagram a `video_url`) is the only route that removes the limit rather than working around it. It trades against the local-first design, so it's his call, not mine.
3. #187 and #188 remain shipped-untested; fold their confirmation into the same install.

## Watch Out For

- **`downscaledPosts` is keyed by ACCOUNT key** (`plat.key`, e.g. `ig_178414…`), not the platform key from `accountToPlatformKey`. It has to match `ps.platforms`, which the results panel iterates. Mixing the two silently hides the badge.
- **The `finally` deletes the light copy on both paths.** If a future change needs the 720p file kept for inspection after a failure, that's the line to touch — but a stray `.ig720.mp4` sits in the render folder, where `projects.js` rename logic walks.
- **`transcodeCopy` has `encoder = "x264"` as a default parameter** (`ffmpeg.js:122`). Inert today because the only caller passes the resolved encoder, but a future caller that forgets would silently drop to CPU. Fega's `clipCutEncoder` is `"gpu"` and his ffmpeg has `h264_nvenc`, so all three encode paths are NVENC today.
- **Don't seed fixtures into `W:` project files.** The dev profile shares the real project tree, and the daily driver is usually open. Session 130's verification used an isolated scratchpad `projectsRoot` plus a fake connected platform in the dev settings, with both dev stores backed up and restored afterwards.

## Logs/Debugging

- **The switch logs twice**: `electron-log` scope `instagram` → `Falling back to a lighter copy { from, to, error }`, and the app logger → `Instagram refused <WxH> — retrying at 720p: <file>`. Both in `%APPDATA%\clipflow\logs\`.
- **If the 720p copy is refused too**, the surfaced error reads "Instagram refused both the <WxH> render and a 720p copy of it. (…)" — deliberately, so it can't be mistaken for a plain upload failure.
- **Verification harnesses** in the session scratchpad (`12402b58…`): `ig189-test.js` (9 assertions against the live Graph API — bogus token, so nothing is uploaded), `ig189-classify-test.js` (13 assertions with `https.request` stubbed, covering both the tagged and untagged branches), `cdp.js` / `shot.js` (CDP evaluator + screenshot).
- **Computer-use input was blocked all session** by a foreground PowerToys Mouse-Without-Borders helper — screenshots worked, clicks didn't. CDP with `--remote-debugging-port=9222` was the way through; see memory `project_cdp_verification_gotchas` gotcha 16.
