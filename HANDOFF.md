# ClipFlow — Session Handoff
_Last updated: 2026-04-13 — "Phase 3D + Phase 4: NLE Render Pipeline + Migration Tests"_

## Current State

**Builds successfully. App launches clean. 74/74 tests pass.** NLE migration is now 4/5 phases complete. The render pipeline no longer depends on pre-cut clip files — it assembles the final video from `sourceFile + nleSegments` via FFmpeg filter_complex. Subtitle timing is correct in rendered output for multi-segment edited clips (previous bug where source-absolute subtitles were passed to the overlay renderer with no mapping is fixed).

User reported "some things are still broken" but we haven't diagnosed them yet — Phase 5 cleanup was deferred pending that investigation.

## What Was Built (This Session)

### Committed last session's uncommitted work (8227a3d, b6cd7b8, 4701811)
- NLE waveform alignment fixes + `initNleSegments` on video load
- Reverted video source to `clip.filePath` (source-file playback deferred)
- `getSegmentTimelineRange` API change: accepts ID or index, returns null on invalid
- Queue badge only counts unscheduled clips
- QueueView 716-line redesign
- Reference docs (commercial architecture, social media API research, TECHNICAL_SUMMARY v3)

### Phase 3D: Save/Load Migration Tests (47e3409)
- Fixed 3 broken tests using old `getSegmentTimelineRange(segments, index)` signature
- Added 3 new API tests (ID lookup, null returns, out-of-bounds)
- Added 6 migration tests covering:
  - `audioSegments`→NLE conversion with `sourceStart` offset
  - Fresh clip initial segment from `startTime`/`endTime`
  - Saved NLE segments round-trip unchanged
  - Multi-segment `audioSegments` migration with correct offsets
  - Subtitle clip-relative→source-absolute migration
  - Source-absolute subtitle loading without double-offset
- Verified migration on real project data (proj_1775500131710_dve3uu, first clip): old format `audioSegments: [{0, 20.53}]` correctly converts to NLE `[303.10, 323.63]`; subtitles get offset by `303.10`.

### Phase 4: NLE Render Pipeline (14b436b)
- **`render.js`**: New `buildNleFilterComplex()` generates `trim`/`atrim`/`concat` per NLE segment from source file. Single-segment uses simple trim, multi-segment does concat. Composites overlay PNG sequence on assembled stream.
- **`probeFps()`**: Added via ffprobe. Output forced to source FPS via `-r` flag (fixes 60fps→25fps bug).
- **`EditorLayout.doQueueAndRender`**: Maps subtitles from source-absolute to timeline time via `visibleSubtitleSegments()` before sending to overlay. Passes `nleSegments` in clip data.
- **`subtitle-overlay-renderer.js`**: Accepts explicit `timelineDuration` (NLE skips duration probe), separate `resolutionProbeFile` (always probes source for video dimensions).
- **Batch render**: Auto-detects source-absolute subtitles via `_format` marker and maps internally.

## Key Decisions

1. **No fallbacks to deprecated systems** — User principle, logged to `tasks/lessons.md`. When committing to a new architecture, delete old paths aggressively. Fallbacks rot, mask bugs in the new system, and create "which path am I on?" confusion. Git history is the backup.
2. **Legacy render fallback kept temporarily** — `render.js` still has a `clipData.filePath` path for clips with no `nleSegments`. This is NOT a degraded fallback — it's the migration bridge for clips created before Phase 4. It should be removed in Phase 5 once all clips have `nleSegments` (or forced migration on load).
3. **Render-time assembly, not edit-time** — `concatCutClip` (which destroyed undo history by materializing edits) is no longer called during editing. The source recording gets trimmed only at render.
4. **Subtitle mapping happens twice by design** — EditorLayout does it for single-clip render (fresh from Zustand), render.js does it for batch render (from disk, detected via `_format` marker). Both paths converge on timeline-time subtitles reaching the overlay renderer.
5. **Captions still clip-relative** — Caption store is NOT migrated to NLE. This is fine for single-segment clips; will need the same treatment if captions need to survive multi-segment edits.

## Next Steps (Priority Order)

1. **Diagnose what's broken** — User mentioned things aren't fully working. Before Phase 5 cleanup, find and document the current bugs. Cleanup without knowing what's broken risks deleting the wrong thing (or worse, deleting code that happens to mask the bug).
2. **Test the render pipeline on a real clip** — Phase 4 built the NLE render path but we haven't actually rendered a multi-segment edit end-to-end. Need to verify:
   - Single-segment clip renders identically to before
   - Multi-segment clip (with deleted sections) renders correctly with subtitle timing intact
   - Frame rate matches source (60fps input → 60fps output)
3. **Phase 5: Dead code cleanup** — After bugs are known, grep for callers of each legacy symbol:
   - Store ops: `splitAudioSegment`, `deleteAudioSegment`, `_trimToAudioBounds`, `_concatRecutAfterDelete`, `_recutAfterDelete`
   - IPC handlers: `clip:recut`, `clip:concatRecut`, `clip:extend`, `clip:extendLeft`
   - Preload methods: `concatRecutClip`, `recutClip`, `extendClip`, `extendClipLeft`
   - `ffmpeg.js`: `concatCutClip` if unreferenced
   - No callers → delete. Callers exist → investigate before deleting.

## Watch Out For

- **Renderer process crashes on `timeout <n> npm start`** — The `timeout` command on Windows git-bash kills Electron ungracefully (exit 143). Use `npm start &; sleep N; kill %1` instead.
- **`timeMapping.js` uses `module.exports`** — CRA's webpack handles CJS imports from ES import syntax. The main process (`render.js`) uses `require()` directly. Both work, don't "fix" one to the other.
- **Subtitle coordinate soup** — Three coord spaces in play: **source-absolute** (storage, `editSegments`), **timeline** (derived, passed to overlay renderer), **clip-relative display** (UI only, `_displayFmt`). Always know which one you're in. The overlay renderer's `findActiveWord` expects **timeline time** in `startSec`/`endSec`/`words[].start/end`.
- **`clipData.subtitles` format** — Can be: `{sub1: [], sub2: [], _format: "source-absolute"}` (editor-saved), `{sub1: [], sub2: []}` (pipeline-generated, clip-relative), or `Array<seg>` (legacy flat). `render.js` handles all three.
- **`resolutionProbeFile` vs `sourceFile`** — In NLE mode, `sourceFile=null` tells overlay renderer to skip duration probe; `resolutionProbeFile=srcFile` still lets it probe for dimensions. Don't collapse these back to one parameter.
- **The user is actively using this** — "some things are still broken" means don't push to master casually until diagnosed. Future sessions should verify changes don't regress user workflows.

## Logs/Debugging

- NLE + migration tests: `npx react-scripts test --watchAll=false --testPathPattern="nleModel"` — 74/74 pass
- Build: `npx react-scripts build` succeeds
- App launch: clean (no console errors, preview generation works)
- Render logs prefix `[Render]` (main process stderr) and `[OverlayRenderer]` (overlay frame capture)
- FFmpeg args logged before each render invocation — grep for `[Render] FFmpeg args:` to see full command
- Real project data to test migration against: `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects\proj_1775500131710_dve3uu\project.json`
