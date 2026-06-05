# ClipFlow — Session Handoff
_Last updated: 2026-06-05 — Session 58 — Shipped #110 Step 1 + 2 (editor + Projects preview now share ONE subtitle resolver), verified behavior-preserving by two multi-agent adversarial passes. Fega tested and found 3 issues — all traced to PRE-EXISTING bugs (#113, #98), NOT regressions. Next session: fix #113 then #98._

---

## One-line TL;DR

The editor (`initSegments`) and the Projects-tab preview (`resolvePreviewSegments`) now both derive subtitles from one shared core, `resolveClipSubtitles` ([resolveSubtitles.js](src/renderer/editor/utils/resolveSubtitles.js)) — extracted verbatim from `initSegments`, so editor output is byte-identical (proven vs the prior commit). Edited clips now show their manual chunking in the preview. Fega's hands-on test surfaced three things that LOOK like the change broke something but are all older bugs the change never touched: the preview ignoring editor trims/cuts (#113) and a split-segment ID collision (#98). #110 stays OPEN pending a clean hands-on pass.

## Current State

Renderer builds clean (`npm run build:renderer`, ~9.5s, only the pre-existing #73 chunk-size warning). **No installer built this session** — all changes are renderer source, daily app still on `0.1.6-alpha`. Commits this session: `3abec02` (#110 Step 1+2) + this wrap commit. Working tree otherwise clean except the usual runtime churn (`data/clipflow.db`, `data/game_profiles.json` — NOT committed). No dev/electron processes left running (only ran `build:renderer`).

## What Was Just Built / Done (session 58)

- **#110 Step 1 + 2 — commit `3abec02`:** unified the subtitle data path.
  - New [`utils/wordRepair.js`](src/renderer/editor/utils/wordRepair.js) — `mergeWordTokens` + `validateWords` moved out of the store verbatim (byte-identical vs HEAD).
  - New [`utils/resolveSubtitles.js`](src/renderer/editor/utils/resolveSubtitles.js) — `resolveClipSubtitles(clip, project, { includeExtras, verbose })`: source selection (5-source chain) + extras (gated) + cleanup + word repair, returning SOURCE-ABSOLUTE `{segments, isPreChunked, clipOrigin, source}`. Lifted verbatim from `initSegments`.
  - [`buildPreviewSubtitles.js`](src/renderer/editor/utils/buildPreviewSubtitles.js) — `resolvePreviewSegments` routes through the core (`includeExtras:false`). Pre-chunked (editor-saved) clips honor their manual chunking; others re-chunk via `segmentWords`. Added `flattenWordsForChunk` (word-synthesis fallback for word-less segments) + a text-clobber guard, both after the Step-1 review flagged a real regression vs the old `gatherWords`. Deleted orphaned `buildPreviewSegments` / `gatherWords` / `isTranscriptionStale`.
  - [`useSubtitleStore.js`](src/renderer/editor/stores/useSubtitleStore.js) — `initSegments` now calls the core and keeps only the display-shape tail. Orphaned helper import removed.
- **Verification (2 multi-agent passes, scripts saved under the session workflows dir):** Step 1 — wordRepair extraction (pass, byte-identical), core faithfulness (pass), preview domain (concern → fixed the word-synthesis regression), reference integrity (pass). Step 2 — initSegments tail parity (pass, byte-identical), downstream consumer integrity (pass), editor↔preview convergence (concern = known residual only).
- **Fega's hands-on test → 3 PRE-EXISTING bugs (NOT regressions; confirmed via git diff):**
  - **#113 (the big one):** the Projects preview ignores `nleSegments` entirely — plays the raw clip bounded by stale `clip.startTime`/`endTime`, subtitles shifted by `clipStart` only, no cut-compression. Explains: preview replays deleted footage, karaoke highlight dead except the last ~3 subtitles on trimmed clips, and extends not showing. Full root cause posted on [#113](https://github.com/Oghenefega/ClipFlow/issues/113).
  - **#98:** `splitSegment` mints `seg2.id = Date.now()`; splitting the same phrase twice collides IDs → the second segment auto-deletes on reopen (Fega's vanishing "know"). Plus a sub-bug: a text-only segment created by typing (`updateSegmentText`, no `words[]`) never renders in the preview because `findActiveWord` skips words-less segments and the neighbor's 1.5s tail-hold shadows it. Both posted on [#98](https://github.com/Oghenefega/ClipFlow/issues/98).
  - The one thing Fega confirmed WORKS: adding a subtitle to an *unedited* clip shows correctly in the preview (proves the new shared data path).

## Key Decisions

- **Core extracted VERBATIM from `initSegments`** so editor output is byte-identical — the structural guarantee against future drift. Verified, not assumed.
- **Chunking (surface 4) left per-caller** — editor chunks via `setSegmentMode`, preview via `segmentWords`. Full chunk-share is **Step 3** (deferred): route both through one helper. Residual = a possible different line break on never-edited clips at segment joins; self-heals on save. Did NOT expand into `setSegmentMode` (hot path) unasked.
- **Logs gated behind `verbose`** — editor passes `verbose:true` (keeps the `[initSegments]` Sentry breadcrumbs), preview passes `verbose:false` (silent).
- **Did NOT fix the 3 bugs inline** — reported root causes and stopped (per bug-report discipline). Fega dismissed the priority prompt and set the order himself: next session do #113 then #98.

## Next Steps (prioritized — Fega's stated order)

1. **#113 — make the Projects preview honor `nleSegments` (do this FIRST).** This is the rest of #110's editor↔preview parity and clears the bulk of what looked broken. Two parts: (a) map `ClipVideoPlayer` playback through `nleSegments` so it skips deleted spans (mirror the editor's `PreviewPanelNew` ~791-836); (b) NLE-map the preview subtitles (run `resolvePreviewSegments` output through `visibleSubtitleSegments`). Smaller stopgap (leading/trailing only): derive preview bounds + subtitle origin from `nleSegments[0].sourceStart` — won't handle internal cuts. Full root cause + file:line on #113.
2. **#98 — split/created-segment integrity (AFTER #113).** (a) Mint collision-proof segment IDs in `splitSegment` / `createSegmentAtTime` / the 1word split (use the `"seg_"+Date.now()+"_"+random` scheme already in `addSegmentAt`). (b) Synthesize a single word entry when a segment is created/edited as text-only so it carries `words[]` for `findActiveWord`. Consider a separate issue for the text-only-render sub-bug.
3. **#110 close-out** — once #113 lands and Fega's hands-on pass is clean, close #110 (apply `status: untested` until he confirms, per the issue-close convention).
4. Backlog unchanged: #112/#64 (child-process stdio), #110 Step 3 (chunk-share), #108, #40, #57.

## Watch Out For

- **#110 is NOT verified by Fega yet.** Don't tell him it's "done."
- **`clip.startTime`/`endTime` go STALE after a timeline trim** — only `_concatRecutAfterDelete` (audio ripple-delete path) refreshes them; ordinary start/end trims update only `nleSegments`. This is the root of #113. **Do NOT "fix" #113 by persisting startTime/endTime on save** without auditing every reader (render fallback, extend re-derivation, thumbnails may assume they mean ORIGINAL recorded bounds). The safe fix is to make the preview CONSUME `nleSegments`, leaving startTime/endTime as original bounds.
- **#113 fix touches the preview's rAF playback loop** in `ProjectsView.js` (`ClipVideoPlayer`) — fragile, has external pause handlers + seek bounding. Mirror `PreviewPanelNew`'s `mapSourceTime`/`seekToSource` approach rather than inventing new mapping.
- **Residual chunk drift (Step 3)** — never-edited clips can show a different line break vs the editor at segment joins on long transcripts. Don't mistake this for a #113 regression while testing.
- **Don't commit `data/clipflow.db` / `data/game_profiles.json`** (runtime churn). Stage source files explicitly.
- **Packaging locks the electron binary** — kill any `npm start` / `npm run dev` ClipFlow electron (path-filtered, NOT the unrelated `D:\OpenDesign` electrons) before `npm run build`.

## Logs / Debugging

- **Build:** `npm run build:renderer` (~9.5s) renderer only; `npm run build` for the full installer.
- **`[initSegments]` breadcrumb:** now emitted from the shared core, but ONLY when called with `verbose:true` (the editor's `initSegments` does; the preview does NOT). The `source=…` line still tells you which of the 5 sources a clip resolved from — the Sentry-debug workflow is preserved.
- **Verification workflow scripts (reusable):** `verify-110-step1-*.js` and `verify-110-step2-*.js` under `.claude/projects/<id>/workflows/scripts/`. Re-run with `Workflow({scriptPath})` to re-audit after any change.
- **Editor vs preview NLE mapping (the #113 reference):** editor overlay = `getTimelineMappedSegments()` → `visibleSubtitleSegments(editSegments, nleSegments)` ([useSubtitleStore.js:24-45,286-290], [timeMapping.js:215-280]); editor preview video = `PreviewPanelNew.js:791-836`. Projects preview = `ProjectsView.js` `ClipVideoPlayer` (bounds 126-127,182-184,208-216) — reads NEITHER (grep: zero `nleSegments`).
- **Split bug:** `splitSegment` [useSubtitleStore.js ~628] `seg2.id = Date.now()`; `findActiveWord.js ~24,67` skips words-less segments + 1.5s `TAIL_HOLD_DURATION`.
- **Clip data on disk:** `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects\<projectId>\project.json`. Each clip: `subtitles.sub1` (+ `_format:"source-absolute"` if editor-saved), `transcription`, `nleSegments`, `captionSegments`, styles.
