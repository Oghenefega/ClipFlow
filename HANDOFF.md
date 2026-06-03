# ClipFlow — Session Handoff
_Last updated: 2026-06-03 — Session 52 — #66/#77 editor left-panel fix (clip-range + timeline-time mapping) + popover timecode fix. Core #66/#77 still needs Fega's manual confirm. #2 "delete subtitle + clip" decided (option 1) but NOT implemented._

---

## One-line TL;DR

Fixed #66 (panel showed whole recording) + #77 (dead play-along highlight) by driving both left-panel tabs from the same clip-range, timeline-mapped segment list the preview overlay already uses. Committed (`5e29e3a`). Fega tested partially: caught two issues — (1) TimecodePopover showed source-absolute timecode → **fixed this session**; (2) "Delete subtitle + clip" wipes the whole timeline → **pre-existing, deferred**, Fega chose option 1 (cut out just the span) but it's NOT built yet.

## Current State

Renderer builds clean (`npm run build:renderer`, only the pre-existing #73 chunk warning). v0.1.5-alpha, prod profile. The #66/#77 mapping work is committed (`5e29e3a`); the popover-display fix + CHANGELOG + this HANDOFF land in the session-52 wrap commit.

## What Was Built / Done (session 52)

**#66 + #77 — one fix (committed `5e29e3a`):** Both Transcript and Edit-subtitles tabs in `LeftPanelNew.js` now render/highlight/seek from timeline-mapped, clip-range segments instead of raw source-absolute arrays.
- `useSubtitleStore.js`: extracted the existing `getTimelineMappedSegments` transform into a shared module-level helper `_mapSegmentsToTimeline(segs, sourceOrigin)`; added `getTimelineMappedOriginalSegments()` for the Transcript tab. (Preview path behavior is byte-identical.)
- `LeftPanelNew.js`: `EditSubtitlesTab` + `TranscriptTab` derive their list via `useMemo(() => getState().getTimelineMapped…(), [rawSegs, nleSegments])` (mirrors `PreviewPanelNew`'s pattern). Edits stay keyed by **id** on the raw store. Boundary conversions: `createSegmentAtTime` maps timeline→source via `timelineToSource`; the "delete subtitle + clip" audio-overlap re-derives the raw segment by id; `TimecodePopover` reads the raw segment by id.

**#1 popover timecode display (this session, in wrap commit):** TimecodePopover showed full-recording source time (`27:21.6`) while the row showed clip time (`00:59.6`). Now the two displayed inputs translate via `sourceToTimeline`/`timelineToSource`; slider/clamp/`updateSegmentTimes` still operate in source-absolute (unchanged, zero risk).

**Issue filed:** [#107] split-at-word (and Transcript word-edit) can target the wrong word when a segment straddles an *internal* audio deletion (mapped-index vs raw-index). Normal clips are 1:1 — not triggered.

## Key Decisions

- **Drive the panel from the proven preview path** (`getTimelineMappedSegments` → `visibleSubtitleSegments`) rather than converting the playhead — reuses battle-tested code; ids survive the mapping so id-based edits are untouched.
- **#78/#84 left untouched** per Fega's explicit instruction. Their string-timestamp defect (editor-saved load reads display-string `start`/`end` into numeric `startSec`) still exists and still blocks verifying #78/#84 — and means **editor-saved clips will render an EMPTY panel** under the new mapping (string `startSec` → NaN in `sourceToTimeline` → all segments dropped). Test #66/#77 on a non-edited / retranscribed clip.
- **"Delete subtitle + clip" → Fega chose OPTION 1:** delete the subtitle AND ripple-remove only its time span (split the audio block around the subtitle, remove the middle). NOT implemented — start of next session.

## Next Steps (prioritized)

1. **Finish verifying #66/#77** (quick, do first). On a freshly-cut or retranscribed mid-source clip via `npm start`: (a) both tabs show only the clip's lines; (b) play → spoken word highlights in sync in both tabs; (c) click word seeks to it; (d) add-at-playhead lands correctly; (e) split/merge/delete/word-edit/timecode-drag still work. If green, close #66 + #77.
2. **Implement #2 option 1** ("delete subtitle + clip" = cut out just the subtitle's span). Touches the audio-segment model: split the overlapping audio segment at `[rawSeg.startSec, rawSeg.endSec]` and ripple-delete the middle, instead of deleting whole overlapping segments. Current destructive handler: `LeftPanelNew.js` ~line 945; audio ops in `useEditorStore.js` (`rippleDeleteAudioSegment` :367 — note it clears the whole timeline when the last segment goes, :374-380). Bug → plan → approval before coding (it's destructive).
3. **Then** the #78/#84 string-timestamp fix (separate, unblocks verifying #78/#84): editor-saved branch in `useSubtitleStore.initSegments` (~:432) must read numeric `s.startSec`/`s.endSec`, not display-string `s.start`/`s.end`.
4. Backlog: #107 (split-at-word index), #64 waveform MAXBUFFER, #105 sliver, #40 dead-code.

## Watch Out For

- **#66/#77 is committed but the CORE behavior is unconfirmed** — Fega only got as far as the popover + delete issues. Don't claim #66/#77 done until the playback-highlight + clip-range walk passes.
- **Empty panel on editor-saved clips is the #78/#84 bug, NOT this fix.** If a clip shows no subtitles, it's a clip with corrupted string `startSec` — test on a clean clip.
- **#2 is pre-existing**, not a regression from #66/#77 — the overlap math is identical to before (raw source-absolute). Don't attribute it to this session's work.
- **`_skipNextSegmentation` / #78 path untouched** — leave it for the dedicated #78/#84 session.

## Logs / Debugging

- **Build:** `npm run build:renderer` clean (~10s, 2734 modules, only #73 chunk warning).
- **Console signals (DevTools; prod needs `CLIPFLOW_DEVTOOLS=1 npm start`):**
  - `[initSegments] source=clip-transcription` (or `…-edited`) — which subtitle source loaded. `…-edited` on a clip = the #78 string-startSec path (will show empty panel under new mapping).
  - `[initSegments] First seg (source-abs): [start-end]` — confirms numeric source-absolute times; if these print as strings/NaN the clip is #78-corrupted.
- **Domains (the whole point of this work):** playback `currentTime` = TIMELINE time (`usePlaybackStore.js:10`); store `editSegments`/`originalSegments` `startSec`/`endSec`/`words[].start` = SOURCE-ABSOLUTE. The panel now maps source→timeline via `getTimelineMapped*` before render. `seekTo` expects TIMELINE; `createSegmentAtTime`/`updateSegmentTimes` expect SOURCE.
- **"Delete subtitle + clip" footgun:** `useEditorStore.rippleDeleteAudioSegment` (:367) sets `audioSegments:[], nleSegments:[]`, duration 0 when removing the only segment (:374-380) → blank timeline. That's the #2 symptom.
