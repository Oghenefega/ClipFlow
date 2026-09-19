# HANDOFF — Session 266 (2026-09-18)

## Current State

Two fixes are on master and **not yet in an installer** (alpha.8 is still the latest on the feed):
#446, stale thumbnails after a re-render (`e1006de`), and #447, the Queue and editor clip switcher
showing the detected length instead of the edited one (`f765ca8`). Both are verified on a dev
fixture and left **open** until Fega sees them on the installed app. Their What's New lines sit in
the `unreleased` entry of `src/main/release-notes.js`.

## Key Decisions

- **A new thumbnail file per render, not a `?v=` cache-buster.** Chromium serves the first image it
  loaded for a file URL for the whole session; this was probed, including a fresh `<img>` 3 s later.
  A new name fixes every display site (Queue ×6, Projects, Analytics ×3, Tracker, editor switcher)
  with no renderer change. Name: `<clipId>_<Date.now()>_renderthumb.jpg`. The `_renderthumb` suffix
  is kept so `projects.js` `renameThumbnailTo` still leaves it alone.
- **The thumbnail is frame 0 of the finished video**, with everything burned in at that moment.
  This was Fega's first ask, and it is **being revisited** (see Next Steps 1).
- **One length rule: `getClipLength(clip)` in `editor/models/timeMapping.js`.** It returns the
  nleSegments sum, else `clip.duration` (imports), else endTime - startTime. The Queue row and
  detail, the editor clip switcher and both TikTok A7 max-duration checks use it. AnalyticsView
  keeps its own inline copy of the same rule; it was already correct and was left alone.

## Next Steps

1. **FIRST: revisit which frame becomes the thumbnail (#446). Fega needs the burned-in captions
   AND subtitles visible in it.** My What's New line said the first frame had "no subtitle word on
   top of it", and he read it as subtitles being removed. Nothing is removed; the thumbnail is a
   snapshot of the finished video. But frame 0 does miss the subtitle more often. Measured on the
   library (line spans; approximate), a subtitle is on screen in 63 of 212 rendered clips at frame 0
   and in 136 at 1 s. When frame 0 has none, the first one arrives after a median 0.4 s (p90 7.1 s).
   Scan: `sub0.js` in the scratchpad. Options to put to him:
   - the first moment a subtitle line is on screen, computed from the clip's timeline;
   - back to 1 s;
   - a fixed small offset.

   Plan-mode it, get his pick, then update the What's New "changed" line to match. Don't cut alpha.9
   before this is settled.
2. **Then cut alpha.9** (carries #446 and #447). Ask him to re-render a clip after changing its title
   card (the Queue picture should update at once) and to check a trimmed clip's length in the Queue.
   Close #446/#447 on confirmation.
3. **Ask Fega how alpha.8 went** (from s265): the drawer opens on This section, Ctrl+Z works after
   trying saved layouts, and Edit layout steps back one drag at a time. Close #442/#443/#444 on
   confirmation. #438's first real end-to-end is the next scheduled post that fires while Corva is
   open.
4. Carry-overs: #445 (recording levels undo; can reuse `_snapshotLayouts`/`restoreLayouts`); #439
   (Post with no platforms is silent) is a good small pick; #440; alpha.7 items still
   `status: untested` (#433–#437); ask about #425, #419, #418, #416, #265.

## Watch Out For

- **The TikTok A7 duration check is now live for pipeline clips.** Before this session it read
  `clip.duration`, which only imports carry, so it never fired on them. A tester whose TikTok
  account max is shorter than their clip now sees the in-panel error and a blocked TikTok publish.
  That is the intended A7 behaviour, but it is new in practice.
- **Existing clips keep their old fixed-name `<id>_renderthumb.jpg` until their next render.** A
  re-render deletes the old file only when it ends in `_renderthumb.jpg` and sits in that project's
  `clips/` folder. The path is read from disk, not from the editor's snapshot.
- Any probe or script that looks for `<clipId>_renderthumb.jpg` by its exact name will miss renders
  made after this change. Match `<clipId>_*_renderthumb.jpg`, or read `clip.thumbnailPath`.
- The real render folder for `2026-01-23 AR Day16 Pt3` has no `Clip 2.mp4`, although that clip's
  renderPath points there. The folder last changed on 2026-08-26, so this is not from this session.
  That clip is rejected; not filed.
- The dev profile was restored byte-identical and `Corva.exe` was never touched. The fixture
  (`…/91748792…/scratchpad/fx`) is disposable.

## Logs / Debugging

- Scratchpad (`…/91748792…/scratchpad`):
  - `fx-setup.js [--restore]`: rejected-only project copy; repoints and restores the dev profile.
  - `repoint.js`: repoints dev at the existing fixture without rebuilding it.
  - `fx-import.js`: adds an import-shaped clip.
  - `drv.js`: CDP eval, and `--shot`.
  - `click.js`: trusted click. Bottom nav at 1280×860: Queue (681,830), Editor (597,830).
  - `p-caption.js`: sets the caption box and presses Queue.
  - `state.js`: the fixture clip's thumbnail state on disk.
  - `cacheprobe/`: the Chromium same-URL cache proof.
- Library scans (read-only):
  - `thumbage.js`: thumbnail mtime vs render mtime.
  - `durscan.js` / `lencheck.js`: detected vs edited lengths.
- **Killing the dev app cleanly:** find its main process with a CommandLine containing
  `Desktop\ClipFlow` and no `--type=`, then `taskkill //F //T //PID <pid>` takes the whole tree.
