---
name: clipflow-editor-patterns
description: Use when working on ClipFlow's video editor — Zustand stores, subtitle/segment operations, timeline, preview panel, transcript/edit subtitles tabs, or any editor component. Triggers on editor feature work, store modifications, segment operations, or playback-related code.
---

# ClipFlow Editor Patterns

The editor is a modular video editor with 14 components + 6 Zustand stores. Follow these patterns exactly.

## Zustand Store Rules

### Subscriptions
- ALWAYS subscribe with selectors: `useStore((s) => s.field)` — never `useStore()` (subscribes to everything)
- NEVER use `getState()` in render paths — it's a one-time snapshot that won't trigger re-renders
- `getState()` is ONLY for event handlers, callbacks, and effects — never for conditional rendering
- If a component's render depends on store data, it MUST subscribe via selector hook

### Store Architecture (6 stores, never merge them)
- `useEditorStore` — project/clip data, clipTitle, dirty flag, save handler
- `useLayoutStore` — panel widths, collapse states, drawer tabs, zoom
- `usePlaybackStore` — playing, currentTime, duration, seek (sourced from video element)
- `useSubtitleStore` — editSegments, originalSegments, styling, split/merge/delete, undo/redo
- `useCaptionStore` — caption text, font, color, formatting
- `useAIStore` — AI generation results, history

### Undo/Redo Pattern
- `_undoStack` and `_redoStack` arrays (max 50 snapshots)
- Call `_pushUndo()` BEFORE every mutation (updateSegmentText, updateWordInSegment, updateSegmentTimes, splitSegment, mergeSegment, deleteSegment)
- Snapshots are `JSON.parse(JSON.stringify(editSegments))` — deep clone
- After undo/redo, call `markDirty()` on editorStore
- Keyboard: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo (skip if target is INPUT/TEXTAREA)

## Segment Data Model

```javascript
{
  id: number,           // unique identifier
  start: string,        // formatted "mm:ss.d"
  end: string,          // formatted "mm:ss.d"
  dur: string,          // "X.Xs"
  text: string,         // display text
  track: "s1",
  conf: "high",
  startSec: number,     // seconds (source of truth for timing)
  endSec: number,       // seconds
  warning: string|null,
  words: [{             // word-level timestamps
    word: string,
    start: number,      // seconds
    end: number,        // seconds
    probability: number
  }]
}
```

## Transcript vs Edit Subtitles — INDEPENDENT

- **Transcript tab** reads from `originalSegments` — sentence-level, never changes with segment mode
- **Edit Subtitles tab** reads from `editSegments` — changes when segment mode switches (3-word, 1-word)
- Text edits update BOTH (via `updateWordInSegment`)
- Segment mode switching rebuilds `editSegments` from `originalSegments` words
- The transcript always shows well-formatted paragraphs with `segBreakAfter` paragraph breaks
- **`editSegments`/`originalSegments` are SOURCE-WIDE, not clip-scoped.** `resolveClipSubtitles({includeExtras:true})` merges the whole `project.transcription` into them so outward extends already have words loaded. NEVER read raw `editSegments` as "this clip's content." Any consumer that needs the clip's ACTUAL transcript/words (AI title/caption input, export text, a transcript join) MUST clip to the cut window via `getTimelineMappedSegments()` (or `visibleSubtitleSegments` directly) — the same clipping the Transcript panel, preview, and render path use. Skipping it leaks the ENTIRE recording (session 87: `_collectClipParams` joined raw `editSegments` → AI titles referenced other clips' moments; the #144 fix exposed it by newly populating `editSegments` on fresh clips).

## Word Token Merging

Whisper returns subword tokens: "raiders" → ["ra","iders"]. ALWAYS merge using segment `.text` as ground truth:
1. Split `segment.text` into real words
2. For each real word, consume tokens greedily until concatenation matches
3. Merged word gets: first token's `start`, last token's `end`, real word's text

NEVER use timing-gap heuristics for merging — whisper gaps are too inconsistent.

## Playback Integration

- `duration` comes from the HTML5 video element's `loadedmetadata` event — NEVER from clip metadata
- `currentTime` comes from the video element's `timeupdate` event
- `syncOffset` adjusts subtitle timing: `adjustedTime = currentTime - syncOffset`
- Both PreviewPanel and LeftPanel must use `adjustedTime` for subtitle matching

## Timeline Rules

- Segments on the same track MUST NOT overlap — enforce during resize/drag
- Ruler ticks must account for label column offset (LABEL_W)
- `contentWidth = timelineWidth - LABEL_W` for all position calculations
- Playhead position uses the same offset calculation

## NEVER Do These

- Never load video/audio files in the renderer process (OOM crash) — use main process + FFmpeg
- Never generate fake/placeholder waveforms — show loading state or empty track
- Never use even-distribution as a fallback for broken timestamps — show nothing instead
- Never fall back to degraded output — fail visibly so the root cause gets fixed

## Subtitle Segmentation (RECURRING REGRESSION — guard every change)

This is the #1 thing that keeps breaking. Any change to chunking MUST keep guards for the first two rules.
- **Never cross a sentence boundary** — split at `.` `!` `?`. Never group the tail of one sentence with the start of the next ("for sure. I").
- **Never group words across a pause** — split when the gap to the next word is >0.7s (and a >2s gap definitely starts a new segment). No "guy baby" when a 2s gap sits between them.
- **A comma/semicolon-bearing word ENDS its segment, never starts one** — after pushing a word ending in `,` or `;`, flush the chunk immediately (soft break).
- **3-word chunking is smart, not blind.** Hierarchy: (1) sentence-end split → (2) pause >0.7s split → (3) forward-look: if adding word N makes 3 but word N+1 is >1s away, flush so N starts the next group → (4) max 3 words; allow 1- or 2-word segments when rules require.
- **Multi-word text typed into a 1-word-mode segment auto-splits** into N segments dividing the original time range. In 3-word mode it's valid as-is — check `segmentMode` first.
- (Future) Keep common phrases atomic ("as always", "of course") — not yet implemented.

## Split Operations

- Split at the **playhead time**, auto-finding the segment that contains that time — don't require the user to select a segment first.
- Buffer for "is this the exact boundary" checks = **0.001s max** (only to avoid zero-duration segments).
- After a split, **sync the timeline's local `selectedSegId`** to the store's new `activeSegId` (else it shows a now-deleted segment as selected).
- Any time comparison involving `endSec` must resolve null/undefined → **Infinity** (legacy full-duration captions have null endSec → `null - 0.05 = NaN` breaks `find()`).
- Segment filtering uses **overlap** (`s.start < clipEnd && s.end > clipStart`), never containment. Never let `clipEnd` be 0 — fall back to Infinity.
- Zoomed-out "merged" track bars must stay **interactive** (render real segments) — never `onResize={() => {}}`.

## Audio Track Model

- The audio track is an **array of segments** (like captionSegments), never a single start/end. A split creates TWO segments.
- Audio segments live in a **Zustand store**, not local React state (playback gap-skip, undo, persistence, other components all need them).
- The **last audio segment's `endSec` is the absolute playback boundary** — in `timeupdate`, pause + clamp when `currentTime >= lastSegEnd` (this is the trim-enforcement mechanism).
- Deleting audio **cascades**: also delete subtitle/caption segments inside that time range (no orphans).
- Destructive cross-track effects (auto-trimming subs/captions to audio bounds) commit **only on mouse-up**, never during the drag — else dragging back can't restore them.
- `DEL` on audio = **ripple-delete** (shifts later segments). `DEL` on subtitle/caption = **plain delete** (leave the gap). Ripple is only meaningful on audio.

## Caption Store

- `setCaptionText` must **auto-create a segment** when `captionSegments` is empty (the preview renders from the array, not the legacy `captionText`).
- `setCaptionText` targets the **active caption** (`activeCaptionId`), never hardcode `segs[0]` — after a split, editing must hit the selected part.

## Karaoke / Word Highlighting

- Drive karaoke from **word timestamps**, never segment boundaries. Build a flat global word index across all segments; the active word = the most recent word that started; derive the containing segment from the word.
- **`words[]` must always cover the segment's `text` (or be empty).** The viewer AND the burned-in exporter render word-by-word from `words[]`; `text` is only the fallback used when `words` is empty. A *partial* `words[]` silently drops the missing word from the render while the panel/timeline (which read `text`) still show it. Any op that sets text or resizes a segment must keep them in sync — manual/blank segments get even-split synth words via `_wordsFromText`. (#116; resize variant = #117)
- Word effects (glow/text-shadow) are **per-span (per-word)**, never per-container — the active word's glow color = `highlightColor`.
- On **word click**, highlight THAT word immediately from the explicit selection — don't wait for playback time to catch up (causes off-by-one).
- **A segment owns time as a half-open interval `[startSec, endSec)`.** Adjacent subtitles share a boundary (`A.endSec === B.startSec`); an inclusive `<= endSec` makes the active-segment `find()` AND `getActiveWordInSeg` claim that instant for the segment *ending* there (it sorts first), so clicking a row — which seeks to its `startSec` — lit up the previous row's bar + boundary word too. Active-segment tracking and word-active checks must use `>= startSec && < endSec` (and bail on `>= endSec`). Keyed off `adjustedTime`, in timeline coords. (#136 follow-up)
- **`handleWordClick` records `clickTime` (the seek target) in `selectedWordInfo`**; a paired effect clears the selection once the *video* reaches it during playback (guarded by `vid.seeking`, since `seekTo` writes the store time synchronously). Without it a mid-playback word click freezes the highlight in every row until the next pause/play, because an explicit selection suppresses playback highlight globally (`anySelected`). (#132)

## Zoom

- Preview wheel zoom needs **no Ctrl modifier** (matches CapCut/Vizard); ±2% per notch (keyboard `Ctrl±` / menu keep ±25%).
- **Preview zoom = a floating layer, not a scroll box (#134).** Zoom by physically resizing the canvas (`width/height = fitSize × scale`, px) so text/overlays re-render crisp — NEVER CSS `transform: scale()` (it bitmap-stretches → blurry text). Use `transform` only for **pan** (`translate`); the canvas is `position:absolute; left/top:50%` and the translate's `-50%,-50%` recenters it.
- **Apply coupled size + pan in one `useLayoutEffect` keyed on zoom** (after the size commit, before paint). Applying a pan transform in the wheel handler while the DOM is still old-size paints a displaced frame the next commit corrects = jitter.
- **Cursor-anchored zoom:** use the math `pan' = dc − (dc − pan)·(scaleNew/scaleOld)` (dc = cursor offset from viewport center). Do NOT read the post-zoom rect in a `requestAnimationFrame` after `setState` — it returns the STALE pre-commit rect, so the nudge cancels to ~0 and content grows from the top-left.
- Any per-step **center drift** must be **proportional to the zoom delta** (`min(1, (sOld/sNew)^k)`, capped ≤1) — a fixed per-notch pull makes a tiny 2% step snap across the screen.
- **Pan is free in every direction at any zoom** with a keep-visible clamp (a sliver always on-screen); **Fit/`Ctrl+0` recenters**. Don't lock pan to center when the canvas is smaller than the viewport — that blocks moving the layer.
- **Timeline** zoom (separate from preview) **anchors to the playhead** — preserve its viewport offset across the zoom change.

## Store Discipline (subtle bugs)

- **Never dual-purpose store state** for both feature logic AND UI visibility. Dropdown-open/panel-expanded = local `useState`; store state only controls behavior. One boolean serving both WILL break one.
- **`Object.entries()`/`Object.keys()` coerce keys to strings** — breaks comparisons against numeric IDs (`Date.now()`). Iterate the source array directly to preserve native types.
- **Rules of Hooks:** all hooks (`useState/useCallback/useRef`) come BEFORE any conditional `return`. Early `return null` goes after the hooks (React error #310 = crash).
- **Long-lived drag/resize handlers** read fresh state via `getState()` inside the handler — never captured closure values (stale across a pointermove sequence).
- **Effect presets are panel-scoped** — `applyEffectPreset` must take a target/scope (subtitle vs caption); never apply to both by default.
- **Segment mode switch preserves user-created/edited segments** — merge manual segments into the set rebuilt from `originalSegments`.
- **Async store actions that await FFmpeg then `set()` derived state** must re-check `get().clip?.id === capturedClip.id` after the await and abort the in-memory write if the clip changed (prevents cross-clip corruption — the #97 family).

## Misc Editor Rules

- **Undo of a clip extension must fully re-cut** the video back to original bounds via IPC + restore metadata — never fake it via audio bounds.
- **Auto-generate clip titles from the transcript** — never leave a clip with `title: ""`.
- **Project preview renders subtitles with the real styling engine**, not a raw text overlay on the thumbnail.
- **Right-click on the timeline must `stopPropagation`** (`pointerdown` button===2 AND `contextmenu`) so it never seeks/moves the playhead.
- **Range sliders are scoped to context** (e.g. ±5s around the segment, clamped to neighbor bounds), not the full video duration.
