# HANDOFF — Session 272 (2026-09-21)

## Current State

0.5.0-alpha.12 is on the update feed, carrying sessions 270 and 271. Fega installed it through the in-app update and confirmed that the picked frame shows as the thumbnail on YouTube, TikTok and Instagram, so #450 and #455 are closed. #454, #456 and #457 are still open with `status: untested`, and so are #451 and #446–#448. No app code changed this session.

## Next Steps

1. **If #454, #456 and #457 are still open, ask Fega:**

   > "When you updated, did you check the other three things inside Corva? One: drag the slider under a clip's picture in the Queue, and that frame becomes the clip's picture in its row and in the Tracker. Two: the Tracker popup shows the whole frame next to the details. Three: pressing play on a Projects clip looks like the editor, with your webcam and game boxes. If they all look right, I'll close those three."

   On a yes, close each one with a note and remove `status: untested`.
2. **Fable review of the s271 batch.** Commits: `940754c`, `a511f1b`, `632e3bd`, `7333423`, `64367fc`, `3e3b2c6`, `2660b6e` and `e2940ba`, per the model/effort split. The design calls to judge them against are under Key Decisions in `git show 9d7b38a:HANDOFF.md`.
3. **Question for Fega, carried from s271.** Asked once in s272 and not answered yet:

   > "Your two clips from Sept 20, 'The WORST HIDING SPOT EVER' and 'BRO STOOD NO CHANCE!', went out on YouTube with the frame you picked. Inside Corva, the Tracker and Queue still show their first frame, because they were posted before this update. Want me to redo those two pictures once? It only changes what Corva shows you, and Corva has to be closed for about a minute. I'd say yes; it's quick."

   Both picks are in `proj_1788433070416_i2dcg8`.
4. **#452 test, when Fega is ready.** For a channel outside the Partner Program, keep the slider and drop only YouTube from "Cover on".
5. **#453 before launch** (launch-ops).
6. **Carried-over pointers from s268–s270.** Rewrite each in plain words before asking:
   - #451 (Fega has nothing to look at; the fix is that closed previews let go of the file);
   - #446, #447, #448;
   - Media tab newest-first?;
   - #442, #443, #444;
   - #438's first real end-to-end;
   - #445, #439, #440;
   - #433 through #437;
   - #425, #419, #418, #416, #265;
   - #176 is probably settled.

## Watch Out For

- **Instagram accounts connected through Instagram Login still get no cover.** `thumb_offset` is only documented and confirmed for Facebook Login. An unknown field could fail the whole post, so none is sent there, and the publish log records why.
- **The Cover-on row depends on the `igBusinessLogin` flag** from `token-store.getAccountsForUI`. Any new place that shows covers uses the same rule (`isIgBusinessLogin`).
- **`clip:posterStill` only reads images under `libraryRoot()`.** A legacy still stored elsewhere falls back to the plain picture.
- **Never draw full-size recording stills into a canvas in the page.** See memory `project_canvas_fullsize_still_memory`.
- **The editor compositor has run-to-run noise at feathered edges** (up to ~360 px, max 15/255). A pixel A/B needs a same-build baseline.
- **The first pick on a reposted clip leaves one orphan picture file.** Accepted.
- **The dev copy points at real folders.** Before any test, repoint `projectsRoot`, `watchFolder`, `outputFolder` and `testWatchFolder`. The s271 `fx271/setup.js` repoints all four.
- **The changelog hook blocks any git commit command containing the word "wrap".** Reword; don't bypass.
- Stop a source-run dev app with `kill-dev.ps1` (PID filter on `Desktop\ClipFlow`), never by image name.

## Logs / Debugging

- **Feed check:** `curl -s https://engine.flowve.app/updates/alpha.yml | head -1` should read `version: 0.5.0-alpha.12`. The s272 build log is `build-alpha12.log` in scratchpad `82d7192e-…/scratchpad/`.
- **s271 harness** (scratchpad `9d76305b-…/scratchpad/fx271/`), for the review:
  - `setup.js` / `restore.js` repoint the four dev folders, and `--accounts` seeds token-less accounts;
  - `reseed.js` builds the RGB-thirds, 2560×2880 layout and 24-clip fixtures;
  - `cdp.js` and `drv.js 9229` drive the renderer and main;
  - `main-spy.js` records TikTok and Instagram uploads;
  - `ab.sh`, `mem-run.sh`, `pxdiff.js` and `color.js` cover A/B, memory and pixel checks.
- **App log:** "Clip picture set {clipId, time}" or "Clip picture not set".
- **Publish log:** TikTok and Instagram success entries carry `cover: {time}`, or `{time: null, reason}` when nothing was sent.
- A blocked render rename logs `[projects] Could not rename <file>: EBUSY`. The Queue picker lets go of the file within ~70 ms of release.
