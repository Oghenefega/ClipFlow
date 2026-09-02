# HANDOFF — Session 229 (2026-09-01)

## Current State

**Batch A of "move the cut" is built, E2E-verified on the dev profile, and committed — NOT
yet in an installer and NOT yet user-verified.** Fega asked for a roll edit (drag a cut between
two sections; both sides move, total length unchanged) and reported the playback loop when a
section was extended over its neighbour's footage. Both landed together:

- `rollCut` in `models/segmentOps.js` + `rollNleCut` store action; the join is owned by the
  later block's left handle in `WaveformTrack` (two bars, `ew-resize`); plain drag = roll,
  Ctrl+drag = single-edge trim for the side the pointer started on; inner right handles are
  no longer drawn (they were under the next block's left handle anyway).
- Playback is section-aware (`sourceToTimelineNear` + `segmentIndexAtTimeline` in
  `timeMapping.js`): `mapSourceTime`, `setNleSegments`, the standby parking, the paused
  `onTimeUpdate`, and the #349 layout painter all resolve against the playhead's timeline
  section first. The cut-crossing tick stamps the EXACT join; the hint tolerates a 50ms
  early seek landing.
- Section-edge drags are one undo entry (`startDrag`/`endDrag` around the gesture).
- 114 tests in `nleModel.test.js` green (18 new). CDP E2E (`e2e-roll.js` in this session's scratchpad
  `8ad8c562…`) passes all 9 steps incl. play-through-overlap and paused-scrub-onto-cut.

**Product decision recorded:** repeating footage on one timeline is WANTED (Fega: "sometimes
I want to use a section of a clip twice"). No clamp against other sections' footage anywhere
in the roll/trim path. Repeats are half-supported until #353.

## Key Decisions

- **Ctrl, not Alt, for the single-edge trim at a join** — Alt+drag already means "duplicate"
  on the subtitle lane.
- **Roll semantics:** C keeps its end (Fega confirmed: A 1–5 / C 11–15, drag 2s left →
  A 1–3 / C 9–15). Gap between the two in the source is preserved.
- **No load-time healing of already-overlapped clips** — Fega undid his; and overlap is now
  legal anyway.
- **Repeat all three** (subtitles, sounds, overlays) with repeated footage — #353.

## Next Steps

1. **Fega's in-app check** (needs an installer — he tests on the daily build): drag a cut
   left/right (length readout unchanged), Ctrl+drag a cut (one side only, including pulling
   B back over A's footage), play across a moved cut and across a deliberate overlap, one
   Ctrl+Z per drag. Then close #351/#352 (currently open, commit SHA in comments).
2. **#353 Batch B:** project subtitles/sounds/overlays PER SECTION (each copy gets an
   `instanceKey`, `id` stays shared so edits hit both), audit `id`-keyed consumers
   (SegmentRow, timeline sub lane, karaoke index, renderPayload, render.js:571,
   PreviewOverlays, ProjectsView preview), and add "Repeat this section" to the Audio-lane
   right-click menu.
3. Backlog from s228 still stands: #350 inherited-layout upsert, #297/#299, quick-wins
   bundle (#307, #304, #320, #303), #341/#342.

## Watch Out For

- **`startDrag` inherits `_pushUndo`'s 300ms debounce:** a section drag started <300ms after
  the previous undo push (e.g. split then instantly drag) captures no pre-drag snapshot, so
  Ctrl+Z steps back past the split too. Pre-existing for subtitle drags; not fixed.
- **`extendNleSegmentLeft/Right` + `extendSegmentLeft/Right` are dead from the UI** (store
  wrappers + tests only). The live handle path is `trimNleSegment*`. Left as-is.
- **`validateSegments` says "non-overlapping" in its doc comment but never checked it** — and
  now must not.
- **`document.querySelector("video")` is the parked STANDBY after a cut-swap** — probes must
  pick the element whose `style.opacity !== "0"` (cost one false failure this session).

## Logs/Debugging

- Dev profile launched from the REPO root (`CLIPFLOW_PROFILE=dev npx electron .
  --remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion
  --disable-renderer-backgrounding --disable-background-timer-throttling`); launching from the
  scratchpad cwd tries to download a different Electron and fails.
- Fixture: s227's AR rejected-clip copy at `e9ffa68e…/scratchpad/fixture` (clip
  `clip_1785192759506_zawr`, sections 0–8 / 8–16); dev `projectsRoot`/`watchFolder`/
  `outputFolder` repointed via `prep.js apply` and restored from `dev-settings-orig.json` at
  wrap. Dev tokens confirmed `{"accounts":{}}` before and after.
- Real pointer gestures on the join handle: `pointerdown` on the element (React root listener),
  `pointermove`/`pointerup` dispatched on `window` (the drag's own listeners), 60ms between
  moves for the rAF. Script + run logs: `e2e-roll.js`, `e2e-run3.txt`, `join-handle.png`.
