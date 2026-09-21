# HANDOFF — Session 271 (2026-09-21)

## Current State

Four features are built and verified on a dev copy but not yet in an installer:
- one thumbnail picker, on the Queue card's picture (#454);
- the picked frame as the TikTok and Instagram cover (#455);
- the whole frame in the Tracker popup (#456);
- Projects previews drawn in the clip's layout (#457).

With session 270's `06c2bb3` (#451, "Auto thumbnail", the 720p clear), that's the next installer's batch. Its What's New lines are all under `unreleased`. #454–#457 are open with `status: untested`, as are #450, #451 and #446–#448. The installed app is still alpha.11.

## Key Decisions

- **One picker, on the Queue card's picture (Fega).** The pick is the clip's picture everywhere (Queue row, Tracker, Projects, Analytics) and the cover on YouTube, TikTok and Instagram. Renders cut the picture at the pick.
- **Calls made in the approved plan:**
  - A Facebook-only clip keeps the slider, because it still sets Corva's picture.
  - A duplicated clip starts with no pick; a repost keeps its pick.
  - TikTok drafts mode sends no cover, because drafts have no cover field.
- **#452 changed: keep the slider for non-Partner channels, and drop only YouTube from "Cover on".** The slider no longer serves only YouTube. This is noted on the issue.
- **Instagram gets the cover only through Facebook Login.** `thumb_offset` is documented for graph.facebook.com and not for Instagram Login, where an unknown field could fail the whole post. Fega's account is Facebook Login.
- **Projects posters are drawn from a still that main scales to 1280px (`clip:posterStill`).** Drawn from full-size stills, the page held ~700 MB after three passes over 24 cards. Scaled, it holds ~230 MB, below the old plain pictures (~250 MB).

## Next Steps

1. **Cut the installer (alpha.12).** Fega asked for this next session. Use the `clipflow-update-launcher` skill. The batch is `06c2bb3` plus `940754c..e2940ba`.
2. **Fega's checks after installing.** Rewrite these in plain words when asking:
   - drag the slider under a Queue clip's picture: the row picture and the Tracker popup show that frame;
   - press play on a Projects clip: it looks like the editor;
   - on the next real post of a picked clip, the TikTok and Instagram covers show the picked frame.

   Close #454, #456 and #457 once he confirms. Close #455 once a real post shows both covers.
3. **Fable review of this batch.** Commits `940754c`, `a511f1b`, `632e3bd`, `7333423`, `64367fc`, `3e3b2c6`, `2660b6e` and `e2940ba`, per the model/effort split.
4. **Question for Fega, asked the way it would be asked in chat:**

   > "Your two clips from yesterday (The WORST HIDING SPOT EVER and BRO STOOD NO CHANCE!) posted with your picked frame on YouTube. Inside Corva, the Tracker and Queue still show their first frame. Want me to re-cut their pictures once? It only changes what Corva shows you, and it needs Corva closed for a minute. I'd say yes, it's quick."

   Both picks are in `proj_1788433070416_i2dcg8`.
5. **#452 test, when Fega is ready.** Carried over, with the new target: drop YouTube from "Cover on" rather than hide the slider.
6. **#453 before launch** (launch-ops).
7. **Carried-over pointers from s268–s270.** Rewrite each in plain words before asking:
   - #446, #447, #448;
   - Media tab newest-first?;
   - #442, #443, #444;
   - #438's first real end-to-end;
   - #445, #439, #440;
   - #433 through #437;
   - #425, #419, #418, #416, #265;
   - #176 is probably settled.

## Watch Out For

- **The installed alpha.11 still has the old picker** at the bottom of the YouTube card and the "No thumbnail" wording. Everything in this handoff reaches Fega only with the next installer.
- **The Cover-on row depends on the `igBusinessLogin` flag** that `token-store.getAccountsForUI` now returns. Any new place that shows covers uses the same rule (`isIgBusinessLogin`).
- **`clip:posterStill` only reads images under `libraryRoot()`.** A legacy still stored elsewhere falls back to the plain picture, which is the old look.
- **Never draw full-size recording stills into a canvas in the page.** See memory `project_canvas_fullsize_still_memory`.
- **The editor compositor has run-to-run noise at feathered edges** (up to ~360 px, max 15/255). A pixel A/B needs a same-build baseline.
- **The first pick on a reposted clip leaves one orphan picture file** (`… repost.jpg` isn't treated as ours). This was accepted.
- **The dev copy points at real folders.** Before any test, repoint `projectsRoot`, `watchFolder`, `outputFolder` and `testWatchFolder`. The s271 `fx271/setup.js` repoints all four.
- **The changelog hook blocks any git commit command containing "wrap".** Reword; don't bypass.
- Stop a source-run dev app with `kill-dev.ps1` (PID filter on `Desktop\ClipFlow`), never by image name.

## Logs / Debugging

- **s271 harness** (scratchpad `9d76305b-…/scratchpad/fx271/`):
  - `setup.js` / `restore.js` back up and repoint all four dev folders. `--accounts` seeds five token-less accounts, including an Instagram Login one.
  - `reseed.js` seeds three fixture projects: an RGB-thirds render, a 2560×2880 layout project using Fega's Reaction and Cam Zm layouts, and a 24-clip load project.
  - `cdp.js`: eval, shot, click, drag, down/moveheld/up (hold mid-gesture), key, gc. `drv.js 9229` evaluates in main.
  - `main-spy.js` swaps the TikTok and Instagram upload calls for recorders.
  - `ab.sh` is the editor-compositor A/B; `mem-run.sh` is the three-pass memory run via `app.getAppMetrics()`.
  - `pxdiff.js` does exact pixel diffs; `color.js` reports RGB-thirds colours.
- **App log:** "Clip picture set {clipId, time}" or "Clip picture not set".
- **Publish log:** TikTok and Instagram success entries carry `cover: {time}`, or `{time: null, reason}` when nothing was sent.
- A blocked render rename still logs `[projects] Could not rename <file>: EBUSY`. The Queue picker should now let go of the file within ~70 ms of release.
