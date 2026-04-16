# ClipFlow — Session Handoff
_Last updated: 2026-04-16 — "Phase 4: Source-file preview"_

## TL;DR

Shipped the full **Phase 4 architectural shift**: editor now previews from `project.sourceFile` (full OBS recording) with NLE segments controlling what's visible. Extends and trims are **instant** — no FFmpeg recut, no video reload, no loading state. Waveform extracted once from source with disk cache, never stretches. Media Offline banner added for when source file is moved/deleted. Matches how DaVinci Resolve / Premiere work: media pool + timeline clips as pointers.

**The previous session's `commitNleExtendCheck` workaround (recut-on-extend) has been deleted.** Build is clean (+/- a few hundred bytes net). Ready for user testing.

## What Phase 4 Changed

### Architecture (the big one)
- `<video>.src` now points at `project.sourceFile` (was: pre-cut clip file).
- `clipFileOffset = 0` always (was: `sourceStartTime`). Video `currentTime` IS source-absolute time — no translation layer needed.
- `clipFileDuration = sourceDuration` (was: small clip-file extent).
- NLE segments' `sourceStart`/`sourceEnd` already matched this model; no segment-math changes.
- Initial seek on `loadedmetadata` points video at `nleSegments[0].sourceStart` so the clip opens at the right place, not at frame 0 of the full source.

### Waveform
- New IPC `waveform:extractCached` — extracts peaks from source once, caches JSON in `{projectDir}/.waveforms/*.json` keyed by `{sourceFile basename, mtime, size, peakCount}`.
- Peak count scales with duration: `~4 peaks/sec, capped at 8000`.
- First open of a 30-min source: ~1.5–6s FFmpeg decode. Every open after: instant JSON parse.
- Waveform no longer stretches during trim/extend — peaks cover the full source range, WaveformTrack just slices into that based on segment bounds.

### Media Offline state (replaces silent clip-file fallback)
- `initFromContext` runs `fileExists(project.sourceFile)` on open. Missing → `sourceOffline: true`.
- Preview area shows red "Media Offline" banner with the missing path and **Locate file…** button.
- Button → `project:locateSource` IPC → OS file picker → updates `project.sourceFile` and saves.
- No fallback to clip file. Per user direction: "why would we fall back to something we're deprecating?"

### AI pipeline (minor)
- Every clip now gets `nleSegments: [{ id, sourceStart: startSec, sourceEnd: endSec }]` at import time. Guarantees the render pipeline always takes the NLE path (render.js has had this path since 2026-04-13; now it's used universally).

### Deleted code
- `commitNleExtendCheck` (entire ~150-line async recut action) — gone.
- `onExtendCommit` prop and callback wiring on `WaveformTrack.js` / `TimelinePanelNew.js` — gone.

## Files Touched (Phase 4)

| File | Change |
|---|---|
| `src/main/main.js` | Added `waveform:extractCached` + `project:locateSource` IPC handlers |
| `src/main/preload.js` | Added `waveformExtractCached`, `projectLocateSource` bridges |
| `src/main/ai-pipeline.js` | Populate `nleSegments` on each clip at creation |
| `src/renderer/editor/stores/useEditorStore.js` | `clipFileOffset=0`, `clipFileDuration=sourceDuration`, Media Offline check, `locateSource` action, deleted `commitNleExtendCheck` |
| `src/renderer/editor/components/PreviewPanelNew.js` | `videoSrc` uses `project.sourceFile`, `onLoadedMetadata` seeks to clip start + extracts via cached IPC, Media Offline UI |
| `src/renderer/editor/components/TimelinePanelNew.js` | Removed `commitNleExtendCheck` selector + `handleNleExtendCommit`, pass `clipOrigin=0` + `clipFileDuration=sourceDuration` to WaveformTrack |
| `src/renderer/editor/components/timeline/WaveformTrack.js` | Removed `onExtendCommit` prop + callback from pointerup |

## Testing Checklist for This Session

**High priority — verify these work:**
1. Open a clip in the editor. Video loads and plays from the clip's start (not frame 0 of the source). Playhead works, ruler click seeks correctly.
2. **Drag the right trim handle outward past the original clip end.** Should extend **instantly**, no loading state, no recut. Playhead can travel to the new end.
3. **Drag the left trim handle outward past the original clip start** (past 0 of the old clip). Should extend **instantly** in both directions.
4. **Drag a trim handle while watching the waveform.** Waveform should NOT stretch/squish — peaks stay stable, segment rectangle just gets wider.
5. Trim inward (shrink). Still works, still instant.
6. Save the clip. Reopen. Bounds persist.
7. Render the clip (publish flow). Output uses source + segments, with correct bounds.

**Media Offline test:**
8. Close editor. Rename the source MP4 on disk. Reopen the clip.
9. Should see red "Media Offline" banner in the preview with the missing path.
10. Click **Locate file…**, pick the renamed file. Banner disappears, video loads.

**Waveform cache test:**
11. Open a clip for the first time — waveform placeholder briefly, then peaks appear (~seconds).
12. Close, reopen same clip — waveform peaks should appear essentially instantly (cache hit).
13. Check `{watchFolder}/.clipflow/projects/{projectId}/.waveforms/` — should have a `.json` cache file.

## Known Follow-Ups (not blocking Phase 4)

1. **Per-clip retranscription (Stage 7b in `ai-pipeline.js`) still reads `clip.filePath`.** Can be replaced with direct audio extraction from source + in/out seeks. Low priority — it works.
2. **Dead code cleanup:** `clip:extend` and `clip:extendLeft` IPC handlers in `main.js` are no longer called. Safe to delete.
3. **Legacy `commitAudioResize` / `commitLeftExtend` in useEditorStore** — the older pre-NLE extend path. Not wired in the current UI but code still there.
4. **Dead cluster constants** in `timelineConstants.js`: `MERGE_THRESHOLD`, `CLUSTER_GAP_PX`, `CLUSTER_MIN_WIDTH_PX`. From 2026-04-14 session; still deletable.
5. **`[DBG ...]` instrumentation** in `usePlaybackStore.js` + `PreviewPanelNew.js` from the snap-to-0 investigation. Remove once Phase 4 is confirmed stable.
6. **Snap-to-0 bug** — was fixed earlier this session by reordering `playback.reset()` in `initFromContext`. Expected to remain fixed under Phase 4 since the whole coordinate-translation class of bugs goes away when `clipFileOffset = 0`.

## Logs / Debugging

- Main-process log: `%APPDATA%/clipflow/logs/main.log`
- Renderer console mirror (debug): `%APPDATA%/clipflow/trim-debug.log` — from 2026-04-13 session.
- Waveform cache: `{watchFolder}/.clipflow/projects/{projectId}/.waveforms/`

## Build & Run

```bash
npx react-scripts build
npm start
```

Build was clean at end of session: `505.58 kB main.js (-62 B)`, `8.72 kB main.css (+30 B)`.

## Tech-Level Context for Next Agent

**Why this refactor matters:** The old model pre-cut every clip to disk and played that file back. Extending a clip required FFmpeg-recutting from source, overwriting the clip file, reloading the `<video>` element. This caused user-visible loading states, waveform stretching during drag, and Windows EBUSY file-lock issues solved only by a 100ms sleep + removeAttribute dance.

**Phase 4 is the standard NLE model:** media pool = source file on disk (referenced, never copied), timeline clips = `{sourcePath, inPoint, outPoint}` pointers. Trim = change pointer bounds. Zero I/O. Zero recut. Render-time is the only moment FFmpeg runs.

The playback store's `mapSourceTime`/`seekTo`/`setNleSegments` translation layer was already coord-space-correct — it used `clipFileOffset` as a translation term. Setting that to 0 makes translation a no-op and everything Just Works because the video element literally plays source-absolute time.
