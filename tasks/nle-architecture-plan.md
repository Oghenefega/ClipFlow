# Non-Destructive NLE Architecture — Implementation Plan

**Date:** 2026-04-07
**Status:** Awaiting approval
**Scope:** Replace destructive editing model with source-reference segments, derived timeline positions, and FFmpeg-only-at-export.

---

## Core Principle

**Subtitles reference source time. Timeline position is always derived, never stored. Sync bugs become structurally impossible.**

---

## Phase 1: New Segment Model (pure data, no UI)

### New Files
- `src/renderer/editor/models/segmentModel.js` — type docs, factory functions
- `src/renderer/editor/models/timeMapping.js` — coordinate conversion pure functions
- `src/renderer/editor/models/segmentOps.js` — split, delete, trim, extend operations

### Data Structures

**NLE Segment (edit segment):**
```js
{
  id: string,           // "seg-<nanoid>"
  sourceStart: number,  // seconds into source file
  sourceEnd: number,    // seconds into source file
}
```

Timeline position = sum of durations of all preceding segments. **Never stored.**

**Subtitle words stay in source time.** Whisper's `word.start`/`word.end` are source-absolute. Visibility and timeline position derived by mapping through the segment list.

### Pure Functions — timeMapping.js

- `sourceToTimeline(sourceTime, segments)` → `{ timelineTime, found }`
- `timelineToSource(timelineTime, segments)` → `{ sourceTime, segmentIndex }`
- `getTimelineDuration(segments)` → total duration
- `getSegmentTimelineRange(segments, index)` → `{ start, end }`
- `visibleWords(words, segments)` → words with derived `timelineStart`/`timelineEnd`
- `visibleSubtitleSegments(subtitleSegs, segments)` → mapped subtitle segments

### Pure Functions — segmentOps.js

- `splitAt(segments, sourceTime)` → new array with segment bisected
- `deleteSegment(segments, segmentId)` → new array without segment (ripple is implicit — removing shortens timeline)
- `trimSegmentLeft(segments, segmentId, newSourceStart)` → adjusted sourceStart
- `trimSegmentRight(segments, segmentId, newSourceEnd)` → adjusted sourceEnd
- `extendSegmentLeft(segments, segmentId, newSourceStart)` → extend earlier into source
- `extendSegmentRight(segments, segmentId, newSourceEnd)` → extend later into source

### Undo/Redo

Snapshot the segment array on every operation. ~3KB per snapshot, 50 max = 150KB. Trivial.

### Verification

- Split at t=5 produces two segments summing to original duration
- Delete middle segment shortens timeline by that segment's duration
- `sourceToTimeline` and `timelineToSource` are exact inverses
- `visibleWords` excludes words in deleted regions, maps survivors to timeline positions

---

## Phase 2: Playback Engine

### Modify: `src/renderer/editor/stores/usePlaybackStore.js`

Video element `currentTime` = **source time** (playing source file directly). Store's public `currentTime` = **timeline time**.

New state:
```js
segments: [],           // NLE segment list
_currentSegIndex: 0,    // which segment is playing
```

Key behaviors:
- `seekTo(timelineSec)` — converts to source time via `timelineToSource`, sets video.currentTime
- `onTimeUpdate(sourceTime)` — converts to timeline time via `sourceToTimeline`. If at segment boundary, seeks to next segment's sourceStart (gap crossing)
- Duration = `getTimelineDuration(segments)`, not `video.duration`

### Modify: `src/renderer/editor/components/PreviewPanelNew.js`

- Video `src` changes from `clip.filePath` to `project.sourceFile` (original recording)
- `onTimeUpdate` routes through segment-aware gap-crossing logic
- `onLoadedMetadata` sets duration from segment list, not video.duration
- Waveform extracted from source file (cached once, never invalidated)

### Files Unchanged
- `findActiveWord.js` — no changes (receives timeline-time data)
- `PreviewOverlays.js` — no changes (receives timeline-mapped segments)

### Verification
- Single segment (full clip): identical to current behavior
- Split at midpoint, play through: small glitch at cut, continues correctly
- Delete first segment: video starts at second segment's source position
- Timeline click-to-seek: correct source position

---

## Phase 3: Wire Into Editor UI

### 3A. Editor Store Replacement

**Modify: `src/renderer/editor/stores/useEditorStore.js`**

Replace state:
```js
// REMOVE: audioSegments, sourceStartTime, sourceEndTime, maxExtendSec, maxExtendLeftSec, extending, videoVersion
// ADD:
nleSegments: [],        // Array<{ id, sourceStart, sourceEnd }>
sourceDuration: 0,      // total source file duration
sourceFilePath: "",     // path to source recording
```

Replace actions:

| Old | New |
|---|---|
| `splitAudioSegment(time)` | `splitAtTimeline(timelineTime)` — pure function call |
| `deleteAudioSegment(segId)` | `deleteSegment(segId)` — instant, no FFmpeg |
| `rippleDeleteAudioSegment(segId)` | Same as `deleteSegment` (ripple is implicit) |
| `resizeAudioSegment(...)` | `trimSegment(id, newSourceStart, newSourceEnd)` |
| `commitAudioResize()` | Removed |
| `_trimToAudioBounds()` | Removed |
| `_concatRecutAfterDelete()` | Removed |
| `_recutAfterDelete()` | Removed |
| `_extendSubtitles()` | Removed — segment changes auto-reveal/hide subtitles |
| `revertClipBoundaries()` | Removed — undo just restores segment list |

Each new action = push undo, call pure function, set new nleSegments, markDirty(). No async. No FFmpeg. No video unloading.

### 3B. Subtitle Store Adaptation

**Modify: `src/renderer/editor/stores/useSubtitleStore.js`**

- `editSegments` stores **source-time** timestamps (no more `- clipStart` subtraction in initSegments)
- New selector: `getTimelineMappedSegments(nleSegments)` → segments with derived `timelineStartSec`/`timelineEndSec` and per-word timeline positions
- `visibleSubtitleSegments` handles filtering (words outside all NLE segments are hidden)

### 3C. Timeline UI

**Modify: `src/renderer/editor/components/TimelinePanelNew.js`**
- Subscribe to `nleSegments` instead of `audioSegments`
- Wire new `splitAtTimeline`, `deleteSegment`, `trimSegment` actions

**Modify: `src/renderer/editor/components/timeline/WaveformTrack.js`**
- Resize handles call `trimSegment`
- Peaks sliced from source-file array using `seg.sourceStart`/`seg.sourceEnd`
- No more `commitAudioResize` on mouse-up

**Modify: `src/renderer/editor/components/timeline/SegmentBlock.js`**
- Uses timeline-mapped positions from subtitle store selector

### 3D. Save/Load and Migration

Save payload:
```js
{ nleSegments, subtitles: { sub1: editSegments }, subtitleStyle, ... }
```

Migration (in initFromContext):
```js
if (clip.audioSegments && !clip.nleSegments) {
  // Old format → NLE segments
  nleSegments = clip.audioSegments.map(seg => ({
    id: seg.id,
    sourceStart: clip.startTime + seg.startSec,
    sourceEnd: clip.startTime + seg.endSec,
  }));
} else if (clip.nleSegments) {
  nleSegments = clip.nleSegments;
} else {
  nleSegments = [{ id: "seg-initial", sourceStart: clip.startTime, sourceEnd: clip.endTime }];
}
```

Subtitle migration: old clip-relative timestamps get `+ clip.startTime` to restore source-absolute.

### 3E. Undo Snapshot Change

`_snapshotStyling` captures `nleSegments` instead of `audioSegments`. Remove `clipMeta` field. Remove `revertClipBoundaries` from restore.

### Verification
- Open old-format project: migration creates correct NLE segments
- Split, delete, undo, redo: all instant (no spinner, no `extending: true`)
- Waveform renders correctly per-segment
- Subtitles appear at correct times
- Save → reload: NLE segments persist correctly

---

## Phase 4: Export Pipeline

### Modify: `src/main/render.js`

Build `filter_complex` from NLE segments at export time:
```js
segments.forEach((seg, i) => {
  filters.push(`[0:v]trim=start=${seg.sourceStart}:end=${seg.sourceEnd},setpts=PTS-STARTPTS[v${i}]`);
  filters.push(`[0:a]atrim=start=${seg.sourceStart}:end=${seg.sourceEnd},asetpts=PTS-STARTPTS[a${i}]`);
  concatInputs.push(`[v${i}][a${i}]`);
});
filters.push(`${concatInputs.join("")}concat=n=${segments.length}:v=1:a=1[basev][basea]`);
```

**60fps preservation:** Add `-r 60` to all output arguments.

Source file = `project.sourceFile` (not clip.filePath).

### Verification
- Export 1-segment clip: matches source quality, 60fps
- Export 3-segment clip: correctly concatenated, subtitles aligned
- Export with subtitle burn-in: overlays correct

---

## Phase 5: Cleanup

### Remove from `useEditorStore.js` (~400 lines):
- `_trimToAudioBounds`, `_concatRecutAfterDelete`, `_recutAfterDelete`
- `_extendSubtitles`, `_shiftAndPrependSubtitles`, `_shiftCaptionLeft`, `_extendCaptionToAudioEnd`
- `revertClipBoundaries`, `commitAudioResize`, `commitLeftExtend`
- Old `deleteAudioSegment`, `rippleDeleteAudioSegment`, `resizeAudioSegment`
- State: `extending`, `videoVersion`, `sourceStartTime`, `sourceEndTime`, `maxExtendSec`, `maxExtendLeftSec`

### Remove IPC Handlers from `src/main/main.js` (~180 lines):
- `clip:concatRecut`
- `clip:recut`
- `clip:extend`
- `clip:extendLeft`

**Keep:** `clip:cut` for initial clip creation from source.

### Remove from `src/main/preload.js`:
- `recutClip`, `concatRecutClip`, `extendClip`, `extendClipLeft`

### Remove/Refactor `src/main/ffmpeg.js`:
- `concatCutClip` → keep if reused in render.js, otherwise remove

---

## Dependency Graph

```
Phase 1 (pure functions) ── no dependencies
    ↓
Phase 2 (playback) ── needs timeMapping.js from Phase 1
    ↓
Phase 3 (UI wiring) ── needs Phase 1 + Phase 2
    ↓
Phase 4 (export) ── needs Phase 1, can parallel with Phase 3
    ↓
Phase 5 (cleanup) ── needs Phase 3 + Phase 4 complete
```

---

## Risk Areas

1. **Seek latency at cut points.** H.265 with 2-second GOP = up to ~2s decode on seek. Acceptable per architecture decision. Future: pre-seek optimization.
2. **Source file availability.** Model requires original recording to always exist. Add check in initFromContext with user-facing error.
3. **Subtitle migration.** Old clip-relative timestamps must be restored to source-absolute using `clip.startTime` from when they were last saved.
4. **Windows file locking.** Eliminated — source file is read-only, never modified during editing.

---

## Fix Included: 60fps Preservation

All FFmpeg encoding functions must include `-r 60`:
- `cutClip` in `ffmpeg.js` (initial clip creation)
- `concatCutClip` in `ffmpeg.js` (if kept for export)
- `renderClip` in `render.js` (final export)

Currently missing, causing 60fps→25fps frame drop.
