# ClipFlow — Session Handoff
_Last updated: 2026-06-03 — Session 53 — #66/#77 verified & closed; fixed #13 timecode-popover slider; added left-panel↔timeline selection sync. Committed + pushed (`46b9259`)._

---

## One-line TL;DR

#66/#77 are confirmed by Fega and closed. The timecode popover's slider/inputs (which were unusable on mid-source clips because the slider bounds mixed timeline `duration` into source-absolute values) are fixed, and clicking a timecode/word/row in the Edit-subtitles panel now highlights the matching block on the timeline. All committed and pushed.

## Current State

Renderer builds clean (`npm run build:renderer`, ~10s, only the pre-existing #73 chunk-size warning). v0.1.5-alpha, prod profile. Latest bundle `index-D2TcUDCj.js`. Working tree clean except incidental `data/clipflow.db` + `data/game_profiles.json` runtime writes from launching the app (intentionally NOT committed). HEAD = `46b9259`.

## What Was Just Built (session 53)

- **#66 / #77 verified → closed.** Fega confirmed on a freshly-cut mid-source clip: both Transcript + Edit-subtitles tabs show only the clip's lines, and play-along highlight + click-to-seek track in sync. The session-52 popover *display* fix (`293c6a0`) was correct all along — Fega had been testing a renderer bundle built ~25 min *before* that commit (build at 15:08, commit at 15:33). A rebuild surfaced the working fix. (Confirmed via Vite content-hash: rebuild produced an identical hash to the bundle under test → fix was already compiled in.)
- **#13 — timecode popover editing fixed.** `TimecodePopover` (`LeftPanelNew.js`) ran its slider, `localStart`/`localEnd`, and neighbor clamps in **source-absolute** time, but `sliderMax` mixed in playback `duration` which is **timeline** time. On a mid-source clip this collapsed the range (`sliderMin` ≈ 600s > `sliderMax` ≈ clip length) → dragging snapped the end to the clip end, the start wouldn't move, inputs were clamped to garbage. Fixed: bounds now derive from the **containing NLE segment's** `sourceStart`/`sourceEnd` (looked up via `sourceToTimeline(seg.startSec).segmentIndex`). Removed the now-orphaned `duration` subscription.
- **Left-panel → timeline selection sync (new).** Previously one-way (timeline click updated the left panel via `handleSegSelect`, but not the reverse). Now a `useEffect` in `TimelinePanelNew` mirrors `activeSegId` onto the timeline's `selectedSegIds`/`selectedTrack` — **paused only**, so the outline isn't dragged around while `activeSegId` auto-follows the playhead during playback. The timecode button (`LeftPanelNew.js`) now sets `activeSegId` + `selectedWordInfo` on click (selects without seeking).

## Key Decisions

- **Selection outline = a *selection*, not a play cursor.** Sync is gated on `!playing` so playback's auto-tracking of `activeSegId` doesn't clobber the user's manual selection. If a "now playing" indicator on the timeline is ever wanted, it's a separate feature (file it).
- **Timecode click selects but does NOT seek** — opening a time editor is editing, not navigation. It sets `selectedWordInfo` so the selection survives the paused-state playhead auto-track guard (LeftPanelNew.js:688–697), matching what a timeline click already does.
- **Popover stays entirely in source-absolute space** (matches `updateSegmentTimes`); only the two displayed numbers convert to timeline via `sourceToTimeline`. Did NOT rewrite the popover into timeline space — surgical bounds fix only.

## Next Steps (prioritized)

1. **Implement "delete subtitle + clip" = option 1** (handoff carryover). Cut out only the subtitle's span instead of wiping the timeline: split the overlapping audio segment at `[rawSeg.startSec, rawSeg.endSec]` and ripple-delete the middle. Touches `useEditorStore.rippleDeleteAudioSegment` (:367; note it zeroes the timeline when the last segment goes, :374–380) and the destructive handler in `LeftPanelNew.js` (~:950). **Destructive → bug→plan→approval before coding.**
2. **#78/#84 string-timestamp fix** (separate, unblocks verifying #78/#84): the editor-saved branch in `useSubtitleStore.initSegments` (~:432) reads display-string `s.start`/`s.end` into numeric `startSec` → NaN → empty panel. Must read numeric `s.startSec`/`s.endSec`.
3. Backlog bugs: #107 (split-at-word index on internal-deletion clips), #95/#98/#87 (subtitle word/id edge cases), #64 (waveform MAXBUFFER), #105 (over-trim sliver), #40 (dead-code hygiene).

## Watch Out For

- **Editor-saved clips still render an EMPTY panel under the timeline mapping** — that's the #78/#84 string-`startSec` bug (NaN → all segments dropped), NOT a regression. Test editor work on freshly-cut / retranscribed clips until #78/#84 is fixed.
- **Source vs timeline coordinate domains are the recurring footgun in the editor.** Playback `currentTime`/`duration` = TIMELINE time; raw store `editSegments`/`originalSegments` `startSec`/`endSec`/`words[].start` = SOURCE-absolute; the panel maps source→timeline via `getTimelineMapped*` before render. `seekTo`/`createSegmentAtTime` boundaries: `seekTo` expects TIMELINE, `createSegmentAtTime`/`updateSegmentTimes` expect SOURCE. Any new popover/timeline math must declare which space it's in.
- **Two selection states still exist** (`activeSegId` in the subtitle store vs `selectedSegIds` local to TimelinePanelNew). They're now synced one-way-each (timeline→panel via handleSegSelect; panel→timeline via the new effect). Timeline multi-select (ctrl/cmd) is unaffected; a single-click sync collapses to one selection by design.
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** — they mutate every time you `npm start` the source-run prod profile.

## Logs / Debugging

- **Build:** `npm run build:renderer` clean (~10s, only the #73 chunk-size warning). Renderer loads from `build/` (`isDev=false`). **`npm start` does NOT auto-rebuild** — always `build:renderer` first or you'll test stale code (this session's #13 false-alarm: a bundle 25 min older than the fix commit looked like a broken fix). Verify the build by Vite content-hash if a fix "doesn't take": same hash = same code.
- **DevTools in prod:** `CLIPFLOW_DEVTOOLS=1 npm start`.
- **Console signals:** `[initSegments] source=clip-transcription` (clean) vs `…-edited` (the #78 string-`startSec` path → empty panel under mapping). `[initSegments] First seg (source-abs): [start-end]` — if these print as strings/NaN the clip is #78-corrupted.
- **Relaunching during dev:** `taskkill //F //IM electron.exe //T` to clear the running instance before a fresh `npm start` (avoids single-instance lock / stale in-memory bundle).
- **Coordinate spots touched this session:** `TimecodePopover` slider bounds now `Math.max(clipSrcStart, …)` / `Math.min(clipSrcEnd, …)` where `clipSrc*` come from the containing NLE segment; selection-sync effect in `TimelinePanelNew` keyed on `[activeSegId, playing]`.
