# HANDOFF — Session 202 (2026-08-25)

## Current State

**#310 built, driven end to end, pushed as `ff2c020`.** Images and GIFs now go from the Media
panel onto a clip and out through the render: click to place at the playhead, drag/corner-resize
on the canvas, move/resize the block on the timeline, undo per gesture, up to 3 stacking lanes,
settings popover (size / opacity / lane / recentre / disable / duplicate / remove), persists on
reopen, burns into both the render and the Shorts thumbnail. Verification notes and the
deviations-from-spec list are commented on #310.

Awaiting Fega's in-app check. He tests on the installed daily driver, so **#310 and #309 both
need the next installer** — neither is closeable until then.

`#317` filed: the repo's two render-graph test files can't run (no jest, no `test` script).

## Key Decisions

1. **`trimStart` is dead weight for media, deliberately.** A still has no inside and a GIF just
   loops, so there is no window INTO the file — the left handle shortens the block from the left
   (moving the anchor), the right handle lengthens it, no upper clamp. The field stays in the
   shape only so `resolvePlacements` (borrowed whole from `audioPlacements.js`) keeps working.
2. **`renderSoundLane` was NOT generalised** into the lane-descriptor loop the ticket sketched —
   the lanes differ in blocks, colours, empty state and the +/− buttons, so merging them makes
   one worse function. Sibling `renderMediaLane(trackIndex)` instead.
3. **The timeline grows with its lanes instead of capping at ~360 and scrolling.** Its scroll
   container is `overflow-y-hidden`, so a cap would hide a lane outright. `TIMELINE_FIXED_H`
   (the old magic 276, now derived from the lane constants) + N × `MEDIA_TRACK_H`. The right
   icon rail got `overflow-y-auto` so a 3-lane timeline can't push "Layout" off a 1280×860 window.
4. **Lane changes happen in the popover, not by dragging a block vertically.** Cheaper, and it
   puts the dedicated control where Size and Opacity already are (UI standards: gestures are
   accelerators, never the only path).
5. **The top media lane absorbs any placement above the visible range.** Undo can restore an
   overlay onto a lane that has since been removed; an overlay that renders but has no block
   would be unfixable by hand.
6. **GIF length is probed at placement time** (`window.clipflow.ffmpegProbe`) — #309 only probes
   audio and video, so the library carries no duration for GIFs. Falls back to 3s.

## Next Steps

1. **Fega's in-app check of #310 + #309** — needs an installer (or `npm run dev`). #309's is:
   open a clip → Media rail → eyeball the grid + drag a file onto the drop strip. #310's is in
   the issue comment.
2. **Cut that installer** — #309 + #310 together is a real batch, and nothing has shipped since
   alpha.5 on the dev side. Use the `clipflow-update-launcher` skill.
3. **#311** (video overlays + their audio) is the next build. It appends ANOTHER FFmpeg input
   after the media inputs — read `renderMediaOverlay.test.js`'s byte-identical test first, that
   is exactly the trap it guards.
4. Then #312; #313 doc fix; #314, #317 whenever convenient.

## Watch Out For

- **Input-index order in `render.js` is load-bearing:** segments → subtitle PNG pipe (index `n`)
  → audio assets → media assets. #311 must append after media, not in the middle.
- **Test clip carries artifacts.** "Clip 4 (copy)" in *2026-08-06 RL Day14 Pt2* (dev profile) has
  two overlays saved on it and its render output + thumbnail were overwritten with overlay
  versions. It's the duplicate clip, nothing real was touched — delete the overlays when done.
- **Preview-vs-output percent mismatch on un-reframed clips** (accepted v1 limit): the preview
  canvas is always 9:16 while the output is the source's own shape. Same mismatch subtitles
  already have; invisible on reframed clips, which is all of Fega's.
- **GIF frames aren't scrub-synced in the preview** (accepted). The render and the thumbnail are
  exact — the thumbnail seeks the GIF with `-ss (t - tlStart) % durationSec`.
- Everything in S201's handoff still stands: media-entry ids are unstable until an installer
  ships (prod alpha.5 prunes dev-written media entries).

## Logs/Debugging

- **jest is not installed and there is no `test` script** (#317). To run the two `__tests__`
  files, use the scratchpad shim pattern from this session: intercept `Module._load` to stub
  `./subtitle-overlay-renderer`, then define global `jest.mock` / `describe` / `test` / `expect`.
  24 assertions passed today.
- `buildNleFilterComplex` is exported as a seam, and `render.js` **loads under plain node** with
  only `subtitle-overlay-renderer` stubbed — fastest way to eyeball a filter graph without
  launching anything.
- **CDP driver for the dev app** lives in this session's scratchpad (`cdp.js` + `step1/step2/
  open-clip/drag/blocks/undo/save/render/shot.js`). Node 24 has a global `WebSocket`, so no `ws`
  dependency is needed. Real input via `Input.dispatchMouseEvent` drives the pointer-event
  handlers correctly, including `setPointerCapture`.
- **Don't put JS with quotes/escapes inside `node -e` inside a Bash heredoc** — several attempts
  died on "Invalid or unexpected token". Write the driver to a `.js` file and run it.
- Overlay geometry probe that proved the render matches the preview: read each overlay wrapper's
  `style.left/top/width` (percent) in the app, then extract the same frame from the render with
  `ffmpeg -ss <t> -i <out> -frames:v 1`.
- Render output duration is the check that the looping `-loop 1` / `-ignore_loop 0` inputs aren't
  extending the video: `ffprobe -show_entries format=duration` — 46.045s, matching the clip.
