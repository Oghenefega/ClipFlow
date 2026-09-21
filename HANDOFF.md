# HANDOFF — Session 270 (2026-09-21)

## Current State

**alpha.11 is on the update feed** and carries the YouTube thumbnail picker (#450). Work done after the cut is committed but not yet in an installer (`06c2bb3`): the #451 video-preview fix, the "Auto thumbnail" tag rename, and Queue clearing the old 720p tag. Its What's New lines wait under `unreleased`. #450 and #451 are open with `status: untested`, as are alpha.9's #446–#448.

## Key Decisions

- **#452: for a channel that can't use custom Shorts thumbnails, hide the slider and show one plain line** (Fega). Building it waits on a test with a non-Partner channel. That test decides how Corva finds out: a 403 to remember, or a silent 200 that needs a read-back.
- **The tag is "Auto thumbnail", not "No thumbnail"** (Fega's wording). A refused pick means the video shows YouTube's automatic thumbnail. The hover no longer promises YouTube Studio.
- **Pressing Queue in the editor wipes `downscaledPosts` too.** Those notes belong to one upload, and a re-queued clip posts as new uploads. Fega agreed after the explanation.
- **Code comments and other internal-only fixes are not Fega's decisions.** State the plan and fold them into the next change.

## Next Steps

1. **Fega installs alpha.11** (relaunch, then Install on the banner). Then he opens a rendered clip in the Queue, drags the Thumbnail slider at the bottom of its YouTube card, posts it, and checks that the channel's Shorts tab shows that frame. Close #450 when he confirms.
2. **The next installer carries `06c2bb3`.** Batch it with more work (~10 changes) unless Fega asks sooner.
3. **#452 test, when Fega is ready (about 10 minutes for him).** He makes a second YouTube channel on his Google account (a new channel isn't in the Partner Program), verifies it with his phone, and connects it in a dev copy I open for him. I rerun the s269 probe (`yt-thumb-probe`) against it, then build the hide-slider behaviour. He deletes one private test video afterwards.
4. **#453 before launch** (launch-ops): every customer shares YouTube's 100 uploads a day. It needs the compliance audit and a plain "daily limit reached" message.
5. Carried over from s268/s269, as pointers for me. **Rewrite each one in plain words before asking Fega:** alpha.9 results (#446, #447, #448); Media tab newest-first?; the alpha.8 Layout drawer items (#442, #443, #444); #438's first real end-to-end; #445, #439, #440; the alpha.7 items still untested (#433–#437); #425, #419, #418, #416, #265; #176 is probably settled by #267 + #449.

## Watch Out For

- **The installed alpha.11 still says "No thumbnail".** The rename ships with the next installer. alpha.11's What's New text in source now says "Auto thumbnail" too: What's New shows every release a user hasn't seen, so anyone who skips alpha.11 reads the current name.
- **Only Fega's channel is proven** for custom Shorts thumbnails (#452). The Data API can't tell whether a channel is eligible, and Google's policies forbid guessing a channel's monetization status.
- **The dev copy points at real folders:** `watchFolder` (the Rename tab lists real pending files, so never click Rename there), `outputFolder`, and `testWatchFolder` (testMode projects render there). Repoint all three before any test that renders (memory gotcha 82).
- **Post now and Retry have never been clicked for real with a thumbnail pick** (carried from s269). The first real Post now is the first true end-to-end.
- **The picker is keyed on `clip.id | renderPath | thumbnailPath`** (carried from s269). If thumbnail naming changes, the preview can show the old render's frames.
- Stop a source-run dev app with the scratchpad `kill-dev.ps1` (PID filter on `Desktop\ClipFlow`). `taskkill //IM electron.exe` also kills DaVinci Resolve's Epidemic plugin, and `Corva.exe` is the installed app.

## Logs / Debugging

- **s270 harness** (scratchpad `fx451/`):
  - `setup.js`, `reseed.js` and `restore.js`. Restore puts the dev profile back byte for byte, and the backups are renamed `*.backup-s270-fx451.restored-<ts>.json`.
  - `drv.js <9222|9229> <expr|@file> [shot.png]`.
  - `patch-load.js`: wraps `HTMLMediaElement.prototype.load` and logs `__probe`-tagged elements.
  - `main-dialog.js`: fakes the file dialog in main, so Settings → Tools & Keys → "🎧 Recalibrate…" opens on a two-track fixture.
  - The `t-*.js` drivers and `kill-dev.ps1`.
- Launch for CDP plus main-process patching: `CLIPFLOW_PROFILE=dev npx electron --inspect=9229 --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion --disable-renderer-backgrounding --disable-background-timer-throttling .` In main, `process.mainModule` is electron, so require by absolute path.
- Every YouTube success entry in `clipflow-publish-log.json` carries `thumbnail: { status, time, error }`. App log, scope `youtube`: "Thumbnail set" or "Thumbnail not set".
- A blocked file rename logs `[projects] Could not rename <file>: EBUSY`. The rename swallows the error on purpose, so that line is the only trace.
