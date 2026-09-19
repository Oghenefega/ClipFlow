# HANDOFF — Session 267 (2026-09-18)

## Current State

**0.5.0-alpha.9 is on the feed** (cut this session, `1a9cc4e`), and Fega has updated and is testing
it. It carries three changes, all still **open** with `status: untested` until he confirms:
- #448: gameplay/camera screenshots, the crop window, and Add to Media / Put on clip (`52a384e`);
- #446: a new thumbnail file per render;
- #447: edited clip lengths in the Queue and the clip switcher.

## Key Decisions

- **The render thumbnail stays on the first frame (#446).** Fega's "subtitles visible" meant the
  burned-in captions, which frame 0 already has. No change was needed; the lesson went to memory
  `feedback_ask_before_measuring`.
- **Gameplay/camera shots are FFmpeg crops of the source in the main process**
  (`render.captureSourceRegion`), not a canvas grab. That gives source resolution with nothing
  burned in. The box comes from the section under the playhead via `resolveCaptureInstant`, which is
  now shared with `renderThumbnail`.
- **One rule for which box exists: `captureRegionRect` in `editor/utils/reframeStyle.js`.** The
  viewer's menu greys items out with its reason, and the capture refuses with the same text.
- **Every crop is a new file.** A screenshot's crop goes beside it (`image:crop`). A Media tab crop
  goes through a temp folder and is imported (`assets:cropCopy`), so nothing is ever written into a
  watched folder.
- **Every screenshot is kept** (`uniquePath` adds " (2)", " (3)"). This replaces #347's
  overwrite-per-clip.
- **A Media crop's copy lands at the END of the grid.** The library lists items in the order they
  arrived, so the grid scrolls to the copy and rings it in green rather than being reordered. I
  offered "newest first" as a separate change; Fega hasn't answered.

## Next Steps

1. **Get Fega's alpha.9 results**, then close each on confirmation and drop `status: untested`:
   - #448: Gameplay only → Crop 16:9 → Put on clip;
   - #446: re-render after changing the title card; the Queue picture updates at once;
   - #447: a trimmed clip's length in the Queue.
2. Ask whether the Media tab should list **newest first** (unanswered from this session).
3. From s265: ask how the Layout drawer changes in alpha.8 went, and close #442/#443/#444 on
   confirmation. #438's first real end-to-end is the next scheduled post that fires while Corva
   is open.
4. Carry-overs: #445 (recording levels undo; can reuse `_snapshotLayouts`/`restoreLayouts`); #439
   (Post with no platforms is silent) is a good small pick; #440; alpha.7 items still
   `status: untested` (#433–#437); ask about #425, #419, #418, #416, #265.

## Watch Out For

- **Render folders now collect screenshots**, because nothing overwrites. Names:
  - `<title>_{thumbnail|gameplay|camera}_<id tail>[ (n)].png`;
  - crops: `… (cropped).png`.
- **JPGs with EXIF rotation** (phone photos) could crop off-target in the Media tab. Chromium shows
  them rotated, but FFmpeg crops the raw pixels. This is untested and unlikely for screenshots; file
  an issue if it shows up.
- **The TikTok A7 duration check now runs on pipeline clips** (live since alpha.9). A clip longer
  than the account's max shows the in-panel error and blocks the TikTok publish.
- **Existing clips keep the old fixed-name `<id>_renderthumb.jpg` until their next render.** To find
  a thumbnail, match `<clipId>_*_renderthumb.jpg` or read `clip.thumbnailPath`.
- The dev profile's `projectsRoot`/`watchFolder`/`outputFolder`/`mediaFolders` were restored (checked
  by read-back). Its token file still has no accounts. The fixture under the scratchpad is disposable.

## Logs / Debugging

- app.log (system module): `Screenshot (<kind>) saved: <path>`, `Screenshot cropped: <path>`,
  `Media crop saved: <path>`. Console errors: `[thumbnail:capture] failed:`, `[image:crop] failed:`.
  A "no box" refusal reads "This part of the clip has no layout" or "This part's layout has no
  camera box".
- Scratchpad (`…/9c5254b6…/scratchpad`):
  - `harness448.js` runs `renderThumbnail` / `captureSourceRegion` / `cropImage` on a real recording
    (`npx electron harness448.js`; output goes to `out448/`).
  - `cdp.js`: eval, shot, click, move, drag, key.
  - `waitcdp.js`, `fixture-setup.js`, `fixture-media.js`, `fixture-restore.js`.
  - At 1280×860: Projects tab (513,830), screenshot ▾ (518,106), message Crop button (483,192).
