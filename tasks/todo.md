# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## NEXT SESSION (Fega's order) — #113 first, then #98

Both are PRE-EXISTING bugs surfaced while testing #110 Step 1+2 (not regressions — verified via git diff). Full root cause + file:line live in the GitHub issue comments.
1. **#113 — Projects preview honors editor trims/cuts** (`nleSegments`). Clears deleted-footage playback, dead karaoke highlight on trimmed clips, and the extend mismatch. (a) map `ClipVideoPlayer` playback through `nleSegments` (mirror `PreviewPanelNew.js:791-836`); (b) NLE-map preview subtitles via `visibleSubtitleSegments`. Do NOT fix by persisting stale `clip.startTime/endTime` — see HANDOFF "Watch Out For".
2. **#98 — split/created-segment integrity.** (a) Collision-proof segment IDs (`splitSegment`/`createSegmentAtTime`/1word split → use `addSegmentAt`'s `"seg_"+Date.now()+"_"+random`). (b) Synthesize a word entry for text-only segments so `findActiveWord` renders them.
3. Then close #110 (with `status: untested`) once Fega's hands-on pass is clean.

---

## #110 — unify editor + preview subtitle data path — Step 1 + 2 DONE (session 58)

**Status:** Step 1 + 2 implemented, build-clean, adversarially verified behavior-preserving.
**#110 stays OPEN** pending Fega's hands-on editor regression pass (the HARD GATE below).

### What shipped (session 58)
- New [`utils/wordRepair.js`](src/renderer/editor/utils/wordRepair.js) — `mergeWordTokens` +
  `validateWords` moved out of the store verbatim (byte-identical, verified vs HEAD).
- New [`utils/resolveSubtitles.js`](src/renderer/editor/utils/resolveSubtitles.js) —
  `resolveClipSubtitles(clip, project, { includeExtras, verbose })`. The shared core: source
  selection (5-source chain) + extras (gated `includeExtras`) + cleanup + word repair.
  Extracted verbatim from `initSegments`. Returns SOURCE-ABSOLUTE `{segments, isPreChunked,
  clipOrigin, source}`. Logs gated behind `verbose` so the editor keeps its `[initSegments]`
  Sentry breadcrumbs while preview cards resolve silently.
- [`buildPreviewSubtitles.js`](src/renderer/editor/utils/buildPreviewSubtitles.js) —
  `resolvePreviewSegments` now calls the core (`includeExtras:false`). Pre-chunked
  (editor-saved) clips honor the user's chunking as-is; others re-chunk via `segmentWords`.
  Deleted orphaned `buildPreviewSegments` / `gatherWords` / `isTranscriptionStale`. Added
  `flattenWordsForChunk` (synthesizes words from text for word-less segments — restores the
  old gatherWords / setSegmentMode fallback) + a text-clobber guard.
- [`useSubtitleStore.js`](src/renderer/editor/stores/useSubtitleStore.js) — `initSegments`
  now calls the core and keeps only the display-shape tail. Tail verified byte-identical to
  HEAD (display fields, both set() paths, id numbering). Orphaned helper import removed.

### HARD GATE — Fega's editor regression pass (walk in `npm run dev`)
Open the editor on each and confirm subtitles look/behave right + Projects preview matches:
1. **Fresh pipeline clip** (never edited) — subtitles populate, chunk normally.
2. **Edited clip** — a manual split/merge persists AND the Projects preview shows the SAME
   line groupings (this is the main drift #110 fixes — should now be exact).
3. **Extended clip** — extras still populate the revealed audio (editor-only extras intact).
4. **Retranscribed clip** — fresh transcription wins, prior edits cleared.
5. **Legacy flat-array clip** (old save format) — still renders.
Plus: render-from-Queue/Projects output matches the editor preview.

### Step 3 (follow-up, NOT done) — full chunking parity for never-edited clips
The only remaining residual: for NON-pre-chunked clips the editor's `setSegmentMode` runs an
extra cross-word dedup + a second (bounds-less) `cleanWordTimestamps` before `segmentWords`;
the preview calls `segmentWords` directly on the flattened core words. Can shift a line break
at segment joins on long never-edited transcripts (timing unaffected). Self-heals on save
(clip becomes pre-chunked → exact match). To close: extract `setSegmentMode`'s chunk
pre-pipeline (gather→dedup→clean→segmentWords) into ONE shared helper used by BOTH
`setSegmentMode` and the preview. Touches a hot editor path → own session + its own
regression pass. Low user impact; do when convenient.

---

## Deferred plans

### #85 Chunk B/D — title/caption clip-signal forwarding (was active session 45)
Plan to forward `energyLevel` + `confidence` into the title/caption prompt
(`useAIStore._collectClipParams` → `title-caption-prompt.js buildUserContent` →
`main.js anthropic:generate`). Chunk D (wire full `creatorProfile`) is
**deliberately deferred** — profile is detection-only by design; feeding
`archetype` into wording re-introduces the generic template-y copy session 42
removed. Full body recoverable from `git log -p tasks/todo.md`. Re-introduce when
returning to #85.

### Interactive architecture/flows visualizer
A previous session drafted a single-page HTML architecture visualizer for the
Obsidian vault (`context/architecture/`) using vis-network 9.x. Never approved or
started. Body recoverable from git history. Re-introduce when there's appetite for
a docs-quality artifact.
