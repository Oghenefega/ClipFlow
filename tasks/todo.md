# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.
> Feature/bug work is tracked as GitHub issues, not here. This file holds
> only the active session's working plan (if any) and deferred drafts.

---

## NEXT SESSION — #110: unify editor + preview subtitle data path (Step 1 + 2)

**Status:** APPROVED by Fega. Do BOTH steps in one fresh session (he asked to combine
them). Not started. This touches the editor's working `initSegments` path, so treat the
editor regression pass as a hard gate, not a formality.

### Why (context from session 56)
Session 56 fixed the *symptoms* of editor↔preview drift (#111: origin offset + a
transcription fallback in the preview). But the two paths still compute subtitles
independently, so they can still diverge. #110 makes them share ONE resolver.

### The 4 divergence surfaces (all verified by reading the code this session)
The editor's `initSegments` ([useSubtitleStore.js:365-627](src/renderer/editor/stores/useSubtitleStore.js#L365)) does work the preview's `resolvePreviewSegments` ([buildPreviewSubtitles.js](src/renderer/editor/utils/buildPreviewSubtitles.js)) skips:
1. **Source selection** — editor uses a 5-source priority chain (saved → clip.transcription
   → pipeline sub1 → legacy → project.transcription); preview now has a fallback but
   different ordering (prefers sub1).
2. **Extras merge** — editor pulls source-wide `project.transcription` for clip *extends*
   ([:469-500](src/renderer/editor/stores/useSubtitleStore.js#L469)). EDITOR-ONLY — preview
   shows the saved clip range, never needs extends. Gate behind a flag.
3. **Cleanup + word repair** — editor filters mega-segments, dedups overlapping segments,
   dedups repeated words ([:502-555](src/renderer/editor/stores/useSubtitleStore.js#L502)),
   then `mergeWordTokens` → `validateWords` → `cleanWordTimestamps` ([:566-571](src/renderer/editor/stores/useSubtitleStore.js#L566)). Preview does none of this.
4. **Chunking (most visible drift)** — editor HONORS the user's manual chunking for
   editor-saved clips (`_skipNextSegmentation`, [:621](src/renderer/editor/stores/useSubtitleStore.js#L621)); otherwise re-chunks via `segmentWords(mode)`. The preview RE-CHUNKS
   editor-saved clips too → a manual split/merge shows different line groupings in preview.

Already-shared utils (good): `segmentWords` ([utils/segmentWords.js](src/renderer/editor/utils/segmentWords.js)) and `cleanWordTimestamps`
([utils/cleanWordTimestamps.js](src/renderer/editor/utils/cleanWordTimestamps.js)).
Currently store-private and must be extracted: `mergeWordTokens`, `validateWords`
(both in [useSubtitleStore.js](src/renderer/editor/stores/useSubtitleStore.js)).

### Step 1 — extract shared core, route PREVIEW through it (low risk; editor untouched)
- New `src/renderer/editor/utils/wordRepair.js` — move `mergeWordTokens` + `validateWords`
  out of the store (extract verbatim; update the store to import them).
- New `src/renderer/editor/utils/resolveSubtitles.js` — pure
  `resolveClipSubtitles(clip, project, { includeExtras })` returning cleaned,
  SOURCE-ABSOLUTE segments + an `isPreChunked` flag (true for editor-saved). Encapsulates
  divergence surfaces 1 + (optional) 2 + 3, extracted verbatim from `initSegments`.
- Rewrite `resolvePreviewSegments` to call it with `includeExtras: false`, then for display:
  if `isPreChunked` → honor boundaries as-is; else → `segmentWords(mode)`; then shift to
  clip-relative (subtract `clip.startTime`) + strip punctuation.
- **Verify:** a clip with a MANUAL SPLIT shows identical groupings in editor and Projects
  preview; a transcription-fallback clip looks clean (no mega-segment ghosting); session-56
  fixes still hold (edited clips + previously-blank clips render).

### Step 2 — route the editor's `initSegments` through the SAME core (the real guarantee)
- Refactor `initSegments` to call `resolveClipSubtitles(clip, project, { includeExtras: true })`,
  delete its inline copy of surfaces 1-3, then keep only its tail: format `editSegments`
  display shape + set `_skipNextSegmentation = isPreChunked`.
- **Behavior-preserving:** the core was extracted FROM `initSegments`, so editor output must
  be identical. This is what structurally prevents future drift.
- **Editor regression pass (HARD GATE) — walk all in `npm start`:** fresh pipeline clip,
  edited clip (manual split/merge persists), EXTENDED clip (extras still populate revealed
  audio), retranscribed clip (fresh wins, prior edits cleared), legacy flat-array clip.
  Plus render-from-Queue/Projects matches editor preview.

### Files
`useSubtitleStore.js` (import extracted helpers; Step 2 refactor), new `utils/wordRepair.js`,
new `utils/resolveSubtitles.js`, `buildPreviewSubtitles.js` (`resolvePreviewSegments`),
`ProjectsView.js` (already calls the resolver — no change expected).

### Watch out for
- **Domain discipline:** core returns SOURCE-ABSOLUTE; preview converts to clip-relative at
  the very edge. `clip.transcription` is clip-relative (offset = clipOrigin); editor-saved
  sub1 + `project.transcription` are source-absolute (offset 0). Same rules as `initSegments`.
- **Extras merge is editor-only** — don't let it leak into the preview (gate on `includeExtras`).
- Extract helpers VERBATIM in Step 1 so Step 2's editor output is byte-identical.

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
