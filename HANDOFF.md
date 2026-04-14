# ClipFlow — Session Handoff
_Last updated: 2026-04-14 — "Trim Freeze Root Cause + clipFileOffset Coordinate Fix"_

## TL;DR

User reported: trimming the left edge of a clip made playback freeze (spacebar/play button unresponsive). **Root cause identified and partially fixed.** Playback now works and the timeline playhead/ruler is correct. **Three layers still render incorrectly after trim**: the waveform, the subtitle track, and the segment body's visual position during an active left-trim drag. All three share the same root cause (coordinate-space mismatch) and all three have existing helpers in `timeMapping.js` waiting to be used.

**If you do nothing else: read this whole document before touching code.** Tonight we burned hours chasing symptoms because we didn't have the coordinate-space model loaded. Load it now.

## The Root Cause (Load This Into Working Memory)

There are **three coordinate spaces** in the editor and they are NOT interchangeable:

| Space | Origin | Used by |
|-------|--------|---------|
| **clip-relative** | 0 = start of the pre-cut clip file on disk | `<video>.currentTime`, legacy subtitles, captions |
| **source-absolute** | 0 = start of the original recording | `nleSegments[i].sourceStart/sourceEnd`, subtitles after Phase 3B |
| **timeline** | 0 = start of the edited timeline (after trims/deletes) | Ruler, playhead, segment on-screen position, overlay renderer |

The video element plays the pre-cut clip file (clip-relative). Segments are source-absolute. The ruler is in timeline coordinates. The translation:

```
sourceAbs = vidTime + clipFileOffset      // clipFileOffset = clip.startTime on the source
timelineT = sourceToTimeline(sourceAbs, nleSegments).timelineTime
```

Before tonight, `usePlaybackStore` was treating `video.currentTime` as if it were source-absolute. For a clip whose `startTime` on the source is 303.10s, a freshly loaded video at `vidTime=0` was being compared against segments starting at `sourceStart=303.10` — always outside, so seek/snap logic flailed and the element stalled at `readyState=1` (HAVE_METADATA).

## What Got Fixed Tonight

### 1. `usePlaybackStore.js` — added `clipFileOffset` and routed every conversion through it
- New field `clipFileOffset: 0` (default). Set by editor store to `sourceStart` of the clip's initial NLE segment.
- `setNleSegments(segments)` now translates `vid.currentTime + clipFileOffset` to source-absolute before the "is current position inside any segment?" check, and translates back via `-clipFileOffset` when writing to `vid.currentTime`.
- `seekTo(timelineSec)` maps timeline→source-absolute via `timelineToSource`, then writes clip-relative to the video (`targetSourceAbs - clipFileOffset`).
- `mapSourceTime(vidTime)` now treats its argument as clip-relative: `sourceAbs = vidTime + clipFileOffset`, and returns seek targets via `toVid(abs) = abs - clipFileOffset`.
- Diagnostic log added in `togglePlay` prefixed `[DBG togglePlay]`.

### 2. `useEditorStore.js` (~line 103)
- When initializing NLE segments from a clip, `usePlaybackStore.setState({ clipFileOffset: sourceStart })` fires **before** `setNleSegments(nleSegs)`. Order matters: `setNleSegments` reads `clipFileOffset` from the store.

### 3. `PreviewPanelNew.js` — rAF seek guard + play() diagnostics
- The rAF loop was firing `video.currentTime = seekToSource` on every frame while the element was already seeking, preventing playback from ever starting. Now guarded:
  ```js
  if (result.needsSeek) {
    if (!video.seeking && Math.abs(video.currentTime - result.seekToSource) > 0.05) {
      video.currentTime = result.seekToSource;
    }
  }
  ```
- `[DBG playEffect]` logs the `play()` promise resolve/reject for future debugging.

### 4. `TimelinePanelNew.js` (~line 121) — playhead no longer goes past trimmed end
- The timeline's own rAF was reading `video.currentTime` directly (clip-relative) and feeding it to the ruler (timeline). On a left-trim, ruler end shrinks but the playhead kept marching in the old ghost space. Fixed by routing through `usePlaybackStore.mapSourceTime(video.currentTime)` and rendering `mapped.timelineTime`.

## What's Still Broken (Same Root Cause, Three Surfaces)

All three bugs: the rendering code is still in the old coordinate model. Helpers exist in `src/renderer/editor/models/timeMapping.js` to fix each. **Do not invent new math — use the helpers.**

### Bug A — Waveform peaks mis-aligned after trim
- File: `src/renderer/editor/components/WaveformTrack.js`
- Symptom: waveform "zooms" or desyncs with segment body after a left-trim. Visible peaks don't match what you hear.
- Fix shape: slice peaks from source-absolute `[sourceStart, sourceEnd]`, then render into the segment's **timeline** x-range via `getSegmentTimelineRange(id, nleSegments)`. Do not use `clipOrigin` math; use the helper.

### Bug B — Subtitle track words drift off actual speech
- File: wherever subtitles are rendered on the timeline track (not overlay renderer — that already maps in EditorLayout).
- Symptom: after trim, subtitle tokens sit at timeline positions that don't correspond to where the word is actually spoken.
- Fix shape: use `visibleSubtitleSegments(subtitles, nleSegments)` from `timeMapping.js` (line ~184). It takes source-absolute subtitles and returns only those visible on the current timeline with timeline-coordinate start/end, handling segment boundaries and gaps automatically.

### Bug C — Segment body "zooms" during active left-trim drag
- User reference: captions already do this correctly — they only resize on mouse-up. The audio/segment body should follow the same pattern, OR update correctly during drag. Currently it does something weird: segment appears to zoom the timeline instead of shrinking the block.
- Fix shape: while dragging, either (a) apply a CSS-only transform based on the drag delta and commit to store on mouse-up (matches caption behavior), or (b) if committing continuously, always derive the segment's on-screen `left/width` via `buildTimelineLayout(nleSegments)` — never compute positions from `sourceStart/sourceEnd` directly.

## Helpers Available in `timeMapping.js` (Use These)

| Helper | Purpose |
|--------|---------|
| `sourceToTimeline(srcAbs, segments)` | Find which segment a source time is in, return timeline time |
| `timelineToSource(tlT, segments)` | Inverse — convert timeline time to source-absolute |
| `getTimelineDuration(segments)` | Sum of segment durations (what the ruler shows) |
| `getSegmentTimelineRange(idOrIndex, segments)` | `{start, end}` in timeline coords for a segment — use for rendering segment blocks & waveform slices |
| `buildTimelineLayout(segments)` | Precomputed layout for all segments (avoid calling getSegmentTimelineRange in a loop) |
| `visibleWords(words, segments)` | Filter + remap words to timeline coords |
| `visibleSubtitleSegments(subs, segments)` | Same for subtitle segments (line ~184) |

## Debug Infrastructure Still in Place

- `src/main/main.js` (~line 316): DevTools auto-opens detached. Every renderer `console-*` is appended to `%APPDATA%/Roaming/clipflow/trim-debug.log`. Session boundary line written on window open. `render-process-gone` handler logs crash reason.
- Live log file: `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\trim-debug.log` — tail it while user reproduces.
- `[DBG togglePlay]` and `[DBG playEffect]` log prefixes — grep the file.

**When the three remaining bugs are fixed, REMOVE this debug instrumentation** (the forced DevTools, the file logger, the DBG logs). Keep only the `render-process-gone` handler as a permanent safety net.

## Reproduction Steps

1. `npx react-scripts build && npm start`
2. Open any project with clips (e.g. `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects\proj_1775500131710_dve3uu`).
3. Double-click a clip → editor opens.
4. Drag the **left** trim handle of a segment inward.
5. Observe: playback works now (fix #1). Ruler/playhead are correct (fix #4). **Waveform peaks don't match what plays. Subtitles drift. Segment body "zooms" during drag.**

## Key Decisions Locked In Tonight

1. `clipFileOffset` is the single source of truth for the vid↔source translation. Do not reintroduce ad-hoc `clipOrigin` offsets in individual components.
2. The video element continues to play the **pre-cut clip file** (not the source recording). The Phase 4 render pipeline assembles from source; playback during editing uses the clip file with a coordinate translation. This is deliberate — changing playback source is a separate project.
3. All rendering that puts something on the timeline ruler **must go through timeMapping helpers**. No component should do `x = (sourceStart / duration) * width` anymore.

## Watch Out For

- **Do not read `video.currentTime` and feed it to timeline-coord UI without translation.** That was bug #4 tonight. Always route through `mapSourceTime` or via a store selector that has already translated.
- **`setNleSegments` depends on `clipFileOffset` being set first.** If you add a new code path that loads segments, set `clipFileOffset` in the same `setState` batch or immediately before.
- **Chromium crashes on unmounted `<video>` without cleanup** (from earlier memory). PreviewPanel's cleanup is intact — don't remove it.
- **Do not auto-open preview servers** — Electron app, not browser-previewable (per memory).
- **Sentry CLIPFLOW-9 is stale** (pre-Phase-4 build hash `main.a33118e9.js`). Ignore it. If it reappears from a fresh build hash, re-investigate.
- **Build hash to verify fixes landed:** after `npx react-scripts build`, check the new `main.*.js` hash is NOT `a33118e9` and NOT whatever ships tonight's commit. Point user to that fresh hash for repro.

## Next Steps (Priority Order)

1. **Fix Bug A (waveform)** — smallest blast radius, read `WaveformTrack.js`, swap peak-slicing math for `getSegmentTimelineRange`-based positioning. Verify visually.
2. **Fix Bug B (subtitle track)** — find the timeline-level subtitle renderer (NOT the overlay renderer), swap in `visibleSubtitleSegments`. Verify words line up with audio.
3. **Fix Bug C (segment body drag)** — decide: mirror caption UX (commit on mouse-up) or continuous via `buildTimelineLayout`. Ask user which feels right before coding.
4. **Remove debug instrumentation** — `main.js` DevTools+logger, DBG prefixes in playback store and preview panel. Keep `render-process-gone`.
5. **Write a Jest test** — a single `editorStore` test that loads a clip with `startTime=303.10`, calls `initNleSegments`, then asserts `usePlaybackStore.getState().clipFileOffset === 303.10`. Prevents regression.
6. **Resume Phase 5 cleanup** (from last handoff) — legacy ops unreferenced now that NLE path is solid.

## Logs/Debugging

- Trim bug log: `%APPDATA%/clipflow/trim-debug.log` (Windows: `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\trim-debug.log`)
- NLE + migration tests: `npx react-scripts test --watchAll=false --testPathPattern="nleModel"` — 74/74 pass (was passing at last check; re-run after coordinate fixes)
- Build: `npx react-scripts build` — verify clean build before handing back to user
- Sentry: flowve/clipflow (token + org info in memory `reference_sentry_api.md`)
- Render logs: `[Render]` prefix (main stderr), `[OverlayRenderer]` prefix (overlay)

## Context For Next Assistant

The user (Fega) is actively using the app and had a real frustrating session tonight where left-trim broke playback entirely. We fixed that. They explicitly said "the header now follows correctly, which is amazing" — celebrate small wins but don't stop. Three rendering layers are still wrong. The fix pattern is identical for all three (use the helpers). Do not re-derive coordinate math from scratch — it was all written and unit-tested in Phase 3.

Research before editing. Read `WaveformTrack.js` end-to-end before changing a single line. Same for the subtitle timeline renderer. The user will correct you hard if you guess-patch.
