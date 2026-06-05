# ClipFlow — Session Handoff
_Last updated: 2026-06-05 — Session 59 — Fixed + closed #113 (Projects preview now honors editor trims/cuts/extends). Fega verified hands-on. Next session: #98._

---

## One-line TL;DR

The Projects-tab preview was playing clips on a "raw recording" clock while the editor saves them on a "trimmed timeline" clock — so it replayed deleted footage and drifted subtitles/captions. Fixed by routing the preview's video playback + subtitles through the editor's own `nleSegments` mapping (`timeMapping.js`), so cuts, trims, and extends all show. Shipped in `d9544cb`, #113 auto-closed, Fega confirmed hands-on. #98 (split/created-segment integrity) is the agreed next task.

## Current State

Renderer builds clean (`npm run build:renderer`, ~9s, only the pre-existing #73 chunk-size warning). **No installer built** — change is renderer source only; daily app still on `0.1.6-alpha`. One commit this session: `d9544cb`. Working tree clean except the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json` — NOT committed). The `npm start` I launched for Fega's test has been stopped (no electron left running).

## What Was Just Built / Done (session 59)

- **#113 — commit `d9544cb` — preview honors editor trims/cuts/extends.** Two coordinated halves, both gated behind `useNle = sourceMode && clip.nleSegments?.length > 0` (unedited/legacy clips keep the exact old raw-span behavior):
  - **Video** ([ProjectsView.js](src/renderer/views/ProjectsView.js) `ClipVideoPlayer`): new module-level `mapPreviewSourceTime(sourceAbs, nle)` mirrors `usePlaybackStore.mapSourceTime` (but the preview `<video>` plays the SOURCE file, so `vid.currentTime` is already source-absolute → no `clipFileOffset`). The rAF tick now walks the NLE segments — skips deleted spans, gap-crosses via seek, reports cut-compressed **timeline** time; load seeks to `nleSegments[0].sourceStart`; effective duration = `getTimelineDuration(nleSegments)`; the seek bar maps timeline→source via `timelineToSource`.
  - **Subtitles** ([buildPreviewSubtitles.js](src/renderer/editor/utils/buildPreviewSubtitles.js) `resolvePreviewSegments`): when `nleSegments` present, route the source-absolute display segments through the editor's `visibleSubtitleSegments` + field-rename (mirrors `_mapSegmentsToTimeline`, [useSubtitleStore.js:24-45]) instead of the flat `clipStart` shift — deleted-region segs drop, survivors compress to a 0-based timeline. Pre-chunked segs are normalized to `startSec`/`endSec` first (they carry `start`/`end`; `segmentWords` output carries `startSec`/`endSec`).
  - **Captions** got fixed for free: they're saved in timeline time already, but the preview was feeding them clip-relative time — the `currentTime`→timeline switch realigns them. (This was the finding the prior handoff had missed.)
- **Verification:** renderer build clean + a 26-assertion synthetic reproduction (`node`, scratch file, deleted after) of the exact mapping math on a trim+internal-cut clip — source→timeline, timeline→source, gap-crossing seeks, and subtitle drop/compress all correct. Then **Fega hands-on confirmed** cut, trim, AND extend all reflect in the preview.
- **#64 enriched (not fixed):** the post-fix log audit caught the waveform extraction failing on a 30-min source with `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`. Posted the root cause on [#64](https://github.com/Oghenefega/ClipFlow/issues/64) — it rules out all 4 of the issue's original hypotheses. NOT a regression from #113 (renderer-only change; this is main-process FFmpeg).

## Key Decisions

- **Reused the editor's proven `timeMapping.js`** (`sourceToTimeline`/`timelineToSource`/`getTimelineDuration`/`visibleSubtitleSegments`) rather than inventing preview-specific math — same code the editor's live playback runs, so the two can't drift. It's CJS internally but imports cleanly into renderer ESM (already done by `usePlaybackStore.js:2-6`).
- **Did NOT persist stale `clip.startTime`/`endTime`** — they remain the ORIGINAL recorded bounds; the preview consumes `nleSegments` instead. (This was the explicit trap in the prior handoff: other readers — render fallback, extend re-derivation, thumbnails — may assume startTime/endTime mean original bounds.)
- **No editor code touched.** `mapSourceTime`/editor stores aren't mounted in the Projects tab, so the preview computes against the clip's own saved `nleSegments` with a small local mapper.
- **Gated everything behind `useNle`** so unedited/legacy clips (and non-sourceMode legacy MP4 clips) are byte-for-byte unchanged. Zero blast radius outside edited clips.

## Next Steps (prioritized — Fega's order)

1. **#98 — split/created-segment integrity (NEXT).** Two parts, full root cause already on the issue: (a) `splitSegment` mints `seg2.id = Date.now()` → splitting the same phrase twice collides IDs → the second segment auto-deletes on reopen (Fega's vanishing "know"). Fix: collision-proof IDs in `splitSegment` / `createSegmentAtTime` / the 1-word split — reuse the `"seg_"+Date.now()+"_"+random` scheme already in `addSegmentAt`. (b) A text-only segment created by typing (`updateSegmentText`, no `words[]`) never renders in the preview because `findActiveWord` skips words-less segments and the neighbor's 1.5s `TAIL_HOLD_DURATION` shadows it — synthesize a single word entry so it carries `words[]`. Consider a separate issue for the text-only-render sub-bug.
2. **#110 close-out** — its hard gate is a hands-on EDITOR regression pass (Step 2 touched the live `initSegments`). Fega's #113 testing exercised the editor (he made the cuts) with no subtitle regressions reported — a positive signal but NOT the formal pass. Walk a fresh pipeline clip / edited clip / extended / retranscribed / legacy-array clip in the editor, then close #110 (apply `status: untested` until he re-confirms).
3. Backlog unchanged: #64 (waveform maxBuffer — now root-caused, fix overlaps #112), #112/#62 (child-process stdio), #110 Step 3 (chunk-share), #108, #40, #57.

## Watch Out For

- **#113 is CONFIRMED by Fega** — safe to call done. (Contrast #110, still unverified.)
- **#64 blocks the timeline waveform on long (~30-min) sources** — opening such a clip in the editor shows a blank waveform (maxBuffer error) but editing/playback still work. Don't mistake the blank waveform for a new bug while testing #98. Root cause + fix direction are on the issue.
- **Don't "fix" #113 further by persisting `startTime`/`endTime`.** They're intentionally left as original bounds. The preview reads `nleSegments`.
- **Residual chunk drift (#110 Step 3, not done):** never-edited clips can show a slightly different LINE BREAK (not timing) vs the editor at segment joins on long transcripts. Self-heals on save. Not a #113 regression.
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** (runtime churn). Stage source files explicitly.
- **Packaging locks the electron binary** — kill any `npm start` / `npm run dev` ClipFlow electron (path-filtered, NOT unrelated electrons) before `npm run build`.

## Logs / Debugging

- **Build:** `npm run build:renderer` (~9s) renderer only; `npm run build` for the full installer. `npm start` runs prod profile from `build/`.
- **#113 reference (the mapping):** editor video = `PreviewPanelNew.js:800-836` + `usePlaybackStore.mapSourceTime` ([usePlaybackStore.js:118]); editor subtitle overlay = `getTimelineMappedSegments()` → `visibleSubtitleSegments` ([useSubtitleStore.js:24-45,286-290], [timeMapping.js:215-280]). Preview now mirrors both in `ProjectsView.js` `ClipVideoPlayer` + `buildPreviewSubtitles.js`. Disk contract: clips persist `subtitles.sub1` source-absolute (`_format:"source-absolute"`) + `nleSegments` (source-absolute `sourceStart`/`sourceEnd`) at [useEditorStore.js:732-733].
- **Re-verify the #113 math:** the synthetic harness pattern (require `editor/models/timeMapping.js` directly as CJS, feed a trim+cut `nleSegments`, assert `sourceToTimeline`/`timelineToSource`/`visibleSubtitleSegments`) reproduces it in seconds — rebuild it if touching the mapping again.
- **#64 error signature:** `[waveform] ffmpeg exit (track 0): code=ERR_CHILD_PROCESS_STDIO_MAXBUFFER msg=stdout maxBuffer length exceeded` → `[waveform] extraction returned empty peaks`. Cause: `execFile` buffers ~260 MB of raw PCM piped to `pipe:1` for a 1804s mono s16 stream. Fix: stream via `spawn` / reduce in FFmpeg / temp file — not `execFile`.
- **Split bug (#98):** `splitSegment` [useSubtitleStore.js ~628] `seg2.id = Date.now()`; `findActiveWord.js:24,67` skips words-less segments + 1.5s `TAIL_HOLD_DURATION`.
- **Clip data on disk:** `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects\<projectId>\project.json`. Each clip: `subtitles.sub1` (+ `_format:"source-absolute"` if editor-saved), `transcription`, `nleSegments`, `captionSegments`, styles.
