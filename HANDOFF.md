# ClipFlow — Session Handoff
_Last updated: 2026-04-07 — "Non-Destructive NLE Architecture — Phase 1-3A Foundation"_

## Current State

**Builds successfully.** The non-destructive NLE segment model is implemented and tested (65/65 unit tests), playback engine is segment-aware, and editor store has new NLE actions — but the old destructive code paths still exist alongside the new ones. Timeline UI components and subtitle store have NOT been wired to the new model yet, so the app still uses the old behavior at runtime.

## What Was Just Built

- **Pure data model** (`src/renderer/editor/models/`):
  - `segmentModel.js` — segment type, factories, validation
  - `timeMapping.js` — sourceToTimeline, timelineToSource, visibleWords, visibleSubtitleSegments (all pure functions)
  - `segmentOps.js` — split, delete, trim, extend operations (all pure, no FFmpeg)
  - `__tests__/nleModel.test.js` — 65 tests covering all operations, roundtrip conversions, subtitle visibility, and integration scenarios

- **Playback engine** (`usePlaybackStore.js`):
  - `nleSegments` state synced from editor store
  - `seekTo()` converts timeline time → source time before setting video.currentTime
  - `mapSourceTime()` converts source time → timeline time with gap-crossing detection
  - Duration derived from `getTimelineDuration(segments)`

- **Preview panel** (`PreviewPanelNew.js`):
  - Video `src` changed from `clip.filePath` to `project.sourceFile` (with legacy fallback)
  - rAF playback loop uses `mapSourceTime()` for segment-aware gap-crossing
  - `onTimeUpdate` (paused seeks) uses NLE mapping
  - `onLoadedMetadata` extracts waveform from source file (800 peaks, cached once)

- **Editor store** (`useEditorStore.js`):
  - `nleSegments` state with migration in `initFromContext`: loads `clip.nleSegments` → old `audioSegments` → fresh `createInitialSegments`
  - New instant actions: `splitAtTimeline`, `deleteNleSegment`, `trimNleSegmentLeft/Right`, `extendNleSegmentLeft/Right`
  - Each action: push undo → pure function → set state → sync playback store
  - `handleSave` persists `nleSegments` alongside legacy `audioSegments`

- **CLAUDE.md** — added "Research Before Editing" as non-negotiable rule
- **Architecture plan** — full 5-phase plan in `tasks/nle-architecture-plan.md`
- **Council session** — 5-advisor council validated the architecture (transcript + HTML report saved)

## Key Decisions

1. **Subtitles reference source time, timeline position is always derived** — eliminates sync bugs by construction (council unanimous)
2. **Big-bang data model, incremental UI** — one tester, zero users, no installed base to protect
3. **No FFmpeg during editing** — split/delete/trim are instant pure functions on the segment list
4. **Video plays from source file** — `project.sourceFile` instead of re-encoded `clip.filePath`
5. **Start with direct HTML5 seeking** — accept small latency at cut points; MSE only if measured latency is unacceptable
6. **VFR is not a concern** — probed actual files, source recordings are CFR 60fps HEVC, cut clips are CFR H.264
7. **60fps must be preserved** — discovered cutClip drops 60fps→25fps due to missing `-r 60` flag; fix included in Phase 4
8. **Legacy code kept alongside new** — old audioSegments/destructive paths still exist for gradual migration; cleanup is Phase 5

## Next Steps (Priority Order)

1. **Phase 3B: Subtitle store adaptation** — `useSubtitleStore.js` must store source-time timestamps and expose a `getTimelineMappedSegments(nleSegments)` selector for timeline-position derivation
2. **Phase 3C: Wire timeline UI** — `TimelinePanelNew.js`, `WaveformTrack.js`, `SegmentBlock.js` must subscribe to `nleSegments` and use new actions (`splitAtTimeline`, `deleteNleSegment`, `trimNleSegmentLeft/Right`)
3. **Phase 3D: Test save/load migration** — open an old-format project, verify NLE segments are created correctly on load
4. **Phase 4: Export pipeline** — rebuild `render.js` to construct FFmpeg `filter_complex` from NLE segment list; add `-r 60` to all encoding
5. **Phase 5: Cleanup** — remove `_trimToAudioBounds`, `_concatRecutAfterDelete`, `_recutAfterDelete`, old IPC handlers (`clip:recut`, `clip:concatRecut`, `clip:extend`, `clip:extendLeft`), dead preload methods

## Watch Out For

- **Old and new code paths coexist** — the old `splitAudioSegment`, `deleteAudioSegment`, `rippleDeleteAudioSegment` still exist and are what the timeline UI currently calls. Until Phase 3C wires the UI to new actions, edits still go through the destructive path.
- **Subtitle timestamp coordinate space** — old subtitles are clip-relative (0-based). New model needs source-absolute. Migration in `initSegments` must add `clip.startTime` back. Get this wrong and all subtitles will be offset.
- **Waveform peaks are now from source file** (800 peaks spanning full source duration). Timeline UI must slice peaks per-segment using `seg.sourceStart/sourceEnd` relative to `sourceDuration`. The old code sliced by absolute clip-relative position.
- **`useEditorStore.getState()` in `onLoadedMetadata`** — called during render path to check nleSegments length. This is a one-time check, not a subscription, so it's acceptable.
- **Undo snapshot system** — `_snapshotStyling` in `useSubtitleStore.js` still captures `audioSegments` and `clipMeta`. Must be updated in Phase 3B to capture `nleSegments` instead and remove `revertClipBoundaries`.

## Logs/Debugging

- NLE model test output: `npx react-scripts test --watchAll=false --testPathPattern="nleModel"` — 65/65 pass
- VFR probe confirmed: source recordings are CFR 60fps (`ffprobe -show_entries frame=pts_time`)
- Cut clips are 25fps (not 60fps) — confirmed frame-level: intervals are 0.04s (25fps) not 0.0167s (60fps)
- Build: `npx react-scripts build` succeeds with +1.71KB gzip increase
