# ClipFlow — Session Handoff
_Last updated: 2026-04-07 — "NLE Architecture — Phase 3B+3C Complete (Subtitle Store + Timeline UI)"_

## Current State

**Builds successfully. App launches clean.** The non-destructive NLE segment model is fully wired end-to-end: data model → editor store → subtitle store → playback engine → timeline UI → preview panel. The old destructive `audioSegments` code paths are no longer called by any UI component. Old code still exists in the codebase but is dead — cleanup is Phase 5.

## What Was Just Built (This Session)

### Phase 3B: Subtitle Store Adaptation
- **`useSubtitleStore.js`**: Timestamps are now source-absolute internally. `_sourceOrigin` tracks the base offset for display formatting. `_displayFmt()` shows clip-relative formatted times while `startSec`/`endSec` are source-absolute.
- **`getTimelineMappedSegments()`**: New selector that calls `visibleSubtitleSegments()` to convert source-absolute → timeline coordinates for UI consumption.
- **`initSegments()`**: Uses `sourceOffset` (amount to ADD) and `rawIsSourceAbsolute` flag. Detects `_format: "source-absolute"` marker on saved subtitles.
- **Undo system**: `_snapshotStyling()` captures `nleSegments`. `_restoreStyling()` restores `nleSegments` on editor + playback stores. Removed `revertClipBoundaries` entirely.
- **`handleSave` in editor store**: Saves subtitles with `_format: "source-absolute"` marker.
- **`PreviewPanelNew.js`**: Subtitle overlay uses `getTimelineMappedSegments()` for display.

### Phase 3C: Timeline UI Wiring
- **`TimelinePanelNew.js`**: Complete migration from old operations to NLE:
  - Store subscriptions: `nleSegments`, `sourceDuration`, `splitAtTimeline`, `deleteNleSegment`, `trimNleSegmentLeft/Right` (removed all `audioSegments`, `splitAudioSegment`, etc.)
  - `editSegments` derived via `getTimelineMappedSegments()` (timeline coordinates)
  - `toSource()` helper for timeline→source conversion at store call sites
  - `handleSubtitleResize`: originals from `getTimelineMappedSegments()`, overlap detection in timeline space, `toSource()` at `updateSegmentTimes` calls
  - `handleSplit`: uses `splitAtTimeline` for audio track
  - `handleDelete`: uses `deleteNleSegment`, overlap detection via `getSegmentTimelineRange`
  - Audio track renders `nleSegments` with derived timeline positions
  - Removed: `leftOffset`, `audioMaxEnd`, `extending` indicator, all `audioSegments` clamping
- **`WaveformTrack.js`**: Rewritten with new props (`sourceDuration`, `nleSegment`, `onTrimLeft`, `onTrimRight`). Peak slicing uses `seg.sourceStart/sourceEnd` directly.
- **`SegmentBlock.js`**: Removed `leftOffset`. Position = `seg.startSec / duration * timelineWidth`.

## Key Decisions

1. **Subtitles reference source time, timeline position is always derived** — eliminates sync bugs by construction
2. **Dual-coordinate-space pattern**: Timeline UI works in timeline coords, store operations in source-absolute. `toSource()` bridges at call boundaries.
3. **No FFmpeg during editing** — split/delete/trim are instant pure functions
4. **Video plays from source file** — `project.sourceFile` instead of re-encoded `clip.filePath`
5. **Legacy code kept alongside new** — old audioSegments paths are dead but not yet removed (Phase 5)
6. **Backward compatibility**: `_format: "source-absolute"` marker on saved subtitles; `initSegments` handles both old (clip-relative) and new formats

## Next Steps (Priority Order)

1. **Phase 3D: Test save/load migration** — open an old-format project, verify NLE segments are created correctly on load, save and reopen
2. **Phase 4: Export pipeline** — rebuild `render.js` to construct FFmpeg `filter_complex` from NLE segment list; add `-r 60` to all encoding
3. **Phase 5: Cleanup** — remove `_trimToAudioBounds`, `_concatRecutAfterDelete`, `_recutAfterDelete`, old IPC handlers (`clip:recut`, `clip:concatRecut`, `clip:extend`, `clip:extendLeft`), dead preload methods, old `audioSegments` store operations

## Watch Out For

- **Old code paths are dead but present** — `splitAudioSegment`, `deleteAudioSegment`, etc. still exist in `useEditorStore.js` but nothing calls them. Don't accidentally re-wire to them.
- **Subtitle coordinate spaces** — `store.editSegments` has source-absolute `startSec`/`endSec`. `getTimelineMappedSegments()` returns timeline-time values. Mix these up and everything will be offset.
- **Caption store is NOT migrated** — captions still use clip-relative coordinates. This is fine for now but will need the same treatment if captions need NLE awareness.
- **`toSource()` fallback** — if `timelineToSource` returns `found: false`, `toSource()` returns the input unchanged. This means times outside any NLE segment pass through unmodified — acceptable for edge cases but could mask bugs.

## Logs/Debugging

- NLE model test output: `npx react-scripts test --watchAll=false --testPathPattern="nleModel"` — 65/65 pass
- Build: `npx react-scripts build` succeeds, 504KB gzip
- App launches clean with no console errors
