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
