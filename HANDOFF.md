# ClipFlow — Session Handoff
_Last updated: 2026-04-14 — "Trim rendering fixes + unresolved snap-to-0 bug"_

## TL;DR

Picked up three trim rendering bugs from previous handoff. **Fixed Bug A (waveform), Bug B (subtitle drift), Bug C (segment zoom during drag), plus two subtitle-clamp regressions discovered along the way.** Removed subtitle clustering entirely per user decision — subs now always render individually.

**One bug remains unfixed:** clicking the ruler on an untrimmed clip snaps the playhead back to 0. Only affects pre-trim state; after any trim the clip behaves normally. Epsilon-tolerance fix attempted, did not resolve it. Investigation plan below.

## What Got Fixed This Session

### Bug A — Waveform peak misalignment (FIXED)
- Root cause: `TimelinePanelNew` was passing timeline `duration` (shrinks on trim) to `WaveformTrack` as the clip-file denominator for peak slicing.
- Fix: added `clipFileDuration` field to `usePlaybackStore` (separate from timeline `duration`). Set once from `video.duration` in `PreviewPanelNew.onLoadedMetadata`. Passed to `WaveformTrack` as the unchanging clip-file extent.
- Files: `usePlaybackStore.js`, `PreviewPanelNew.js`, `TimelinePanelNew.js`.

### Bug C — Segment body "zooms" during left-trim drag (FIXED)
- User requirement: live update during drag, not commit-on-mouseup.
- Fix: added `trimSnapshot` useState in `TimelinePanelNew` that freezes the pixel-scale denominator for the duration of the drag. `onTrimStart` captures the pre-drag `effectiveDuration`; `onTrimEnd` clears it. Trim math still commits live; only the visual px/sec scale is frozen so existing segments don't reflow under the cursor.
- Files: `TimelinePanelNew.js`, `WaveformTrack.js` (added `onTrimStart`/`onTrimEnd` props, fired from pointerdown/pointerup).

### Bug B — Subtitle drift (FIXED as side effect of A + C)
- Timeline subtitle rendering already went through `visibleSubtitleSegments`; the drift was a downstream symptom of the waveform/segment miscalibration. Once A and C were fixed, subtitles lined up.

### Subtitle clamp #1 — segment-level (FIXED)
- Symptom: trimming into a subtitle region made the whole subtitle vanish immediately.
- Fix: `visibleSubtitleSegments` in `timeMapping.js` now clamps start/end to the kept overlap instead of dropping when either endpoint falls in a deleted region.

### Subtitle clamp #2 — word-level (FIXED)
- Symptom: after clamp #1, subtitle block still vanished because individual words were being filtered eagerly — the block effectively disappeared when the trim crossed the word **start**.
- User requirement: "I want it to vanish when it hits the **end**."
- Fix: applied same clamp logic to `visibleWords` helper in `timeMapping.js`.

### Clustering removed (per user decision)
- Tried 3-tier multi-level clustering, then simpler binary clustering. User rejected both: "I just wanted it to go from one version of grouping to seeing everything individually, not different layers and layers of zoom of grouping."
- Final: stripped clustering logic from `TimelinePanelNew`. Subs always map 1:1 from `visibleSubs`.
- Dead constants left in `timelineConstants.js`: `MERGE_THRESHOLD`, `CLUSTER_GAP_PX`, `CLUSTER_MIN_WIDTH_PX`. **Delete next session.**

## ⚠️ Unfixed — Snap-to-0 Bug (Pre-Trim Only)

### Symptom
On a freshly opened clip that has **not been trimmed yet**, clicking anywhere on the ruler or waveform to move the playhead causes it to snap back to timeline 0 immediately. Play does not advance past 0. As soon as the user performs **any** trim on the segment, the bug disappears and ruler clicks work normally for the rest of the session.

### What the logs showed
An infinite `onTimeUpdate` loop firing with:
```
vidT: 0.495826, tlT: 0, needsSeek: true, seekToSource: 0
```
repeated indefinitely. `vid.currentTime = 0.495826` is clip-relative; segment `sourceStart = 106.49582637729549`. Difference is `~106.0` (the `clipFileOffset`), so the vid time was *exactly at* segment start in source-absolute — but a sub-millisecond FP drift was making `sourceToTimeline` declare it "outside," triggering a re-seek to `seg.sourceStart - clipFileOffset` which landed back at the same spot, looping forever.

### What I tried (didn't work)
1. Added `BOUNDARY_EPS = 0.001` in `timeMapping.js`:
   ```js
   if (sourceTime >= seg.sourceStart - BOUNDARY_EPS && sourceTime <= seg.sourceEnd + BOUNDARY_EPS) { ... }
   ```
2. Clamped the returned time to `[sourceStart, sourceEnd]` so the mapping is stable.
3. Applied same EPS tolerance in `usePlaybackStore.setNleSegments` "is inside any segment?" check.

User re-tested → "it didn't work." The loop still fires.

### New hypothesis (to try next session)
The epsilon fix was in the right file but may not be the actual root cause. Suspects:
- **`setNleSegments` firing multiple times on init** and resetting `currentTime: 0` on every fire. The `snapToFirst` branch explicitly does `set({ currentTime: 0 })` — if this fires during a ruler click, that's the snap.
- **React re-render order**: editor store init sets `clipFileOffset` then `nleSegments`, but there may be a frame where `setNleSegments` runs with `clipFileOffset` stale at 0, seeing `vid.currentTime=0.49` as outside all segments (since `sourceStart=106+`), and snapping to segment 0 start.
- **`seekTo(0)` being called somewhere on mount** — e.g. an init effect or an unmount/remount of PreviewPanel resetting the video.

### Concrete next steps
1. Add a **call counter + stack trace** to `setNleSegments`:
   ```js
   setNleSegments: (segments) => {
     console.log("[DBG setNleSegments]", ++callCount, "offset:", get().clipFileOffset,
       "segs:", segments.map(s=>[s.sourceStart,s.sourceEnd]), new Error().stack);
     ...
   }
   ```
2. Add a log in the `snapToFirst` branch specifically — "[DBG snapToFirst] forcing currentTime=0".
3. Reproduce: open clip, click ruler once, capture first 10 lines of the log. If `setNleSegments` fires on the ruler click (it shouldn't), that's the bug.
4. Also log every call to `seekTo` with its argument and caller — the ruler click goes through `seekTo`; if it's receiving `0` as input, the bug is upstream in `TimelinePanelNew`'s ruler click handler, not in the store.

### Debug instrumentation currently in place
**Do not remove until bug is fixed.** Present in `usePlaybackStore.js`:
- `[DBG togglePlay]` — logs state on spacebar/play click.
- `[DBG seekTo in/writing vid.currentTime]` — logs every seek with input & output.
- `[DBG onTimeUpdate paused]` — in PreviewPanelNew.

Log file: `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\trim-debug.log`.

## Coordinate Model (Still Load This)

Three coordinate spaces, still the canonical model:

| Space | Origin | Used by |
|-------|--------|---------|
| clip-relative | 0 = start of pre-cut clip file | `<video>.currentTime` |
| source-absolute | 0 = start of original recording | `nleSegments[i].sourceStart/End` |
| timeline | 0 = start of edited output | Ruler, playhead, segment blocks |

Translations:
```
sourceAbs = vidTime + clipFileOffset
timelineT = sourceToTimeline(sourceAbs, nleSegments).timelineTime
```

Helpers in `src/renderer/editor/models/timeMapping.js` — always use these, never re-derive.

## Reproduction of Unfixed Bug

1. `npx react-scripts build && npm start`
2. Open a project, double-click any untrimmed clip.
3. Click anywhere on the ruler mid-clip.
4. Observe: playhead snaps back to 0.
5. Now drag either trim handle inward by any amount, release.
6. Click ruler again → works normally from here on.

## Other Notes from Session

- **Project-tab rapid-click glitch**: user reported that opening a project too fast redirects to Rename tab. Not investigated yet. Separate bug.
- **Tests**: `visibleWords` and `visibleSubtitleSegments` were changed (clamp logic). Re-run `npx react-scripts test --watchAll=false --testPathPattern="timeMapping|nleModel"` to confirm no regressions.

## Next Steps (Priority Order)

1. **Fix snap-to-0 with call-counter instrumentation on `setNleSegments` + `seekTo`.** Most likely culprit: duplicate `setNleSegments` call during init resetting currentTime.
2. Remove all `[DBG ...]` instrumentation once fixed — keep only `render-process-gone` handler in main.js.
3. Delete dead cluster constants from `timelineConstants.js`.
4. Investigate project-tab rapid-click redirect.
5. Re-run timeMapping/NLE tests after clamp changes.
6. Resume Phase 5 legacy-ops cleanup.

## Logs/Debugging

- Trim debug log: `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\trim-debug.log`
- Build: `npx react-scripts build`
- Run: `npm start`
- Tests: `npx react-scripts test --watchAll=false --testPathPattern="timeMapping|nleModel"`
- DevTools auto-opens detached (instrumentation still in `main.js`).

## Watch Out For

- `setNleSegments` has a `snapToFirst` branch that hardcodes `currentTime: 0`. Any code path firing `setNleSegments` unexpectedly will cause visible playhead snap. This is the prime suspect for the unfixed bug.
- Don't remove `clipFileOffset` routing — it's load-bearing for the entire vid↔source translation.
- Don't remove `clipFileDuration` — waveform peak slicing needs the unchanging clip-file denominator, not timeline duration.
- Electron app, not browser-previewable. Don't auto-open preview servers.
