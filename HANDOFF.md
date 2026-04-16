# ClipFlow — Session Handoff
_Last updated: 2026-04-16 (session 4) — "Phase 4 ship + hardening + post-test bug triage"_

---

## TL;DR

Three arcs this session:

1. **Shipped Phase 4** (commit `5f408e8`): editor previews from `project.sourceFile`, NLE segments control visibility, extends/trims are instant, waveform disk-cached, Media Offline banner replaces silent clip-file fallback.
2. **Shipped Phase 4 crash hardening** (commit `4e5adc9`): `preload="auto"` → `"metadata"`, imperative `<video>` src teardown before re-assignment. Defensive measure against `blink::DOMDataStore` crash on large source files.
3. **User tested. Crash recurred. Two more bugs surfaced.** Session is wrapping with a prioritized board and clear next-session starting point.

**Status: Phase 4 works at the core (trims/extends are instant — log-confirmed on a 30-min source file), but has gaps and the renderer is still crashing.**

---

## 🚨 Start Here — Read First

### 1. The renderer crash is NOT fixed.

My hardening commit (`4e5adc9`) was deployed and the app crashed again the same day.

```
[2026-04-16 14:51:56.632] [error] (system) [sess_81ed27726163]
  Renderer process gone: crashed (exit code: -1073741819)
```

Exit code `-1073741819` = `0xC0000005` = Windows ACCESS_VIOLATION. Classic `blink::DOMDataStore::GetWrapper` null-deref signature (per `reference_sentry_api.md` and memory entry `feedback_video_cleanup.md` — 23 historical occurrences).

**What's weird:** the PreviewPanelNew and ProjectsView `<video>` elements both have the required unmount cleanup. Phase 4 hardening added imperative src management + `preload="metadata"`. Yet it still crashes ~2 min into editor work.

**What this means for UX:** When the renderer dies, Electron reloads the window, React remounts from scratch, and `App.js` line 70 defaults `useState("rename")`. So **the crash dumps the user back to the Rename tab and loses all unsaved editor state.** The user reported this explicitly: *"it bugged out and went to the rename tab, so what I was working on didn't save."*

**There is no autosave.** This is the most painful gap right now.

### 2. Subtitle-extends bug — root cause found.

When you extend a clip left/right, the waveform correctly shows audio in the extended range, but **subtitles remain clamped to the original clip bounds.** This is a Phase 4 completeness bug.

**Root cause:** `src/renderer/editor/stores/useSubtitleStore.js` — `initSegments()`, lines 412–475.

At init time (when the editor opens a clip), the store filters the source-wide transcription down to `[clip.startTime, clip.endTime]`:

```js
// Line 412-414
const rawFilterStart = rawIsSourceAbsolute ? clipOrigin : 0;
const rawFilterEnd = rawIsSourceAbsolute ? (clip.endTime || Infinity) : (clipDuration > 0 ? clipDuration : Infinity);

// Line 471-475
const segs = deduped
  .filter((s) => {
    if (rawFilterEnd === Infinity) return true;
    return s.start < rawFilterEnd && s.end > rawFilterStart;
  })
```

Any segment outside the **original** clip range gets discarded *before* it reaches `editSegments`. So when the user extends, there's nothing in the store to render in the newly-revealed range — the extended audio plays but is silent in subtitles.

**Fix direction:** Remove (or significantly widen) this filter. `visibleSubtitleSegments` in `timeMapping.js` + the NLE segments in `useEditorStore` already handle timeline-time clipping at render time. The store should hold the source-wide transcription; timeline clipping happens downstream via `getTimelineMappedSegments()` (line 319).

Watch out for: **manual edits vs. re-init.** If the user has edited subtitles within the clip range and then extends, the edits need to be preserved while new source-range segments are merged in. Safest path: on extend, diff current `editSegments` vs. full source transcription and merge in any missing source segments that fall in the new extended range. Harder path, but correct. Simplest path: just don't filter at init; subsequent extends reveal already-present data.

### 3. Subtitle mismatch regression — needs user repro.

User mentioned *"some subtitle mismatch, which hasn't existed for a bit"* — but didn't give specifics. Could be:
- Karaoke highlight off by one word?
- Timing drift accumulating over the clip?
- Wrong word shown at a given time?

**Ask the user to describe the symptom with a timestamp example before investigating.** It may also be downstream of the extends bug (B1) — if segments are getting clamped/sliced weirdly, timing can shift.

---

## The Full Board (prioritized)

TodoWrite is persisted for this session (`tasks/todo.md` not updated yet — see follow-ups). Rank order:

| # | ID | Item | Est | Notes |
|---|------|------|-----|-------|
| 1 | **B1** | Remove clip-bound filter in `useSubtitleStore.initSegments` so extends populate subs | 1–2 hr | Root cause found. Start here. |
| 2 | **B2a** | Add editor autosave / crash recovery | 1–2 hr | Until B2 is actually fixed, this is the bandage. Users are losing work. |
| 3 | **B2** | Investigate persistent renderer crash. Enable `crashReporter` minidumps + add `window.addEventListener("error"/"unhandledrejection")` → IPC → main-process log before crash | 2–4 hr | Do B2a first so investigation doesn't destroy work. |
| 4 | **B4** | Add `-r 60` to FFmpeg args in `cutClip` — 60fps sources drop to 25fps (memory: `project_60fps_bug.md`) | 30 min | Quick win. |
| 5 | **V1** | Walk through 13-step Phase 4 verification checklist (below). Only the "extend works" step is log-confirmed so far. | 15–30 min | Do this after B1. |
| 6 | **C1** | Phase 4 cleanup: delete `[DBG ...]` logs, `commitAudioResize`, `commitLeftExtend`, dead IPCs (`clip:extend`, `clip:extendLeft`), dead constants (`MERGE_THRESHOLD`, `CLUSTER_GAP_PX`, `CLUSTER_MIN_WIDTH_PX`) | 30–45 min | Hygiene. |
| 7 | **B3** | Subtitle mismatch regression | ? | Blocked on user repro. May resolve via B1. |
| 8 | **C2** | Per-clip retranscription in `ai-pipeline.js` Stage 7b still reads `clip.filePath` — switch to source + in/out | 1–2 hr | Last consumer of pre-cut clip files. |
| 9 | **P1** | Sentry pre-launch backlog — 7 deferred items (memory: `project_sentry_backlog.md`) | multi-session | Pre-launch gate. |
| 10 | **C3** | Drop `clip.filePath` lifecycle entirely after C2 | defer | Architectural, separate session. |

---

## What Was Shipped This Session

### Commit `5f408e8` — Phase 4: source-file preview

**Architecture:**
- `<video>.src` = `project.sourceFile` (full OBS recording)
- `clipFileOffset = 0` always (coord translation becomes no-op)
- `clipFileDuration = sourceDuration`
- Initial seek on `loadedmetadata` → `nleSegments[0].sourceStart`
- Every clip gets `nleSegments: [{ sourceStart, sourceEnd }]` at import (render pipeline always takes NLE path)

**Waveform:**
- New IPC `waveform:extractCached` — caches JSON in `{projectDir}/.waveforms/*.json` keyed by `{basename, mtimeMs, sizeBytes, peakCount}`. Peak count: `Math.min(8000, Math.max(400, Math.ceil(dur * 4)))`.

**Media Offline:**
- `initFromContext` runs `window.clipflow.fileExists(project.sourceFile)` on open. Missing → `sourceOffline: true`.
- Red banner + **Locate file…** button → `project:locateSource` IPC → OS picker → updates `project.sourceFile`.
- **No fallback to clip file** (per explicit user direction: "why would we fall back to something we're deprecating?").

**Deleted (Phase 4 cleanup wave 1):**
- `commitNleExtendCheck` (~150 lines)
- `onExtendCommit` wiring across `WaveformTrack.js` + `TimelinePanelNew.js`

**Files touched:** `main.js`, `preload.js`, `ai-pipeline.js`, `useEditorStore.js`, `PreviewPanelNew.js`, `TimelinePanelNew.js`, `WaveformTrack.js`.

### Commit `4e5adc9` — Phase 4 hardening (did NOT fix the crash)

- `preload="auto"` → `preload="metadata"` on editor `<video>`
- `<video src={videoSrc}>` JSX prop replaced with imperative effect: pause + removeAttribute + load → assign new src → load
- Still worth keeping in — defensive, lower buffer pressure, proper teardown ordering. But **the crash persists**, so the actual root cause lies elsewhere.

### Files touched (both commits)

| File | Change |
|---|---|
| `src/main/main.js` | `waveform:extractCached` + `project:locateSource` IPC handlers |
| `src/main/preload.js` | Bridges: `waveformExtractCached`, `projectLocateSource` |
| `src/main/ai-pipeline.js` | Populate `nleSegments` on each clip at creation |
| `src/renderer/editor/stores/useEditorStore.js` | `clipFileOffset=0`, Media Offline check, `locateSource` action, deleted `commitNleExtendCheck` |
| `src/renderer/editor/components/PreviewPanelNew.js` | `videoSrc` uses `project.sourceFile`, imperative src effect, seek-to-sourceStart on loadedmetadata, cached waveform IPC, Media Offline UI, `preload="metadata"` |
| `src/renderer/editor/components/TimelinePanelNew.js` | Removed `commitNleExtendCheck` selector + handler |
| `src/renderer/editor/components/timeline/WaveformTrack.js` | Removed `onExtendCommit` prop/callback |

---

## Testing Status

### What's confirmed working (from user's test session logs)

```
[2026-04-16 02:54:18] ExtendLeft 258.0  → 247.33  (+11s left)
[2026-04-16 02:55:06] ExtendLeft 247.33 → 223.61  (+24s left)
[2026-04-16 02:57:27] ExtendRight 329   → 336.27  (+7s right)
```

Extends on a 30-min source are instant, source-absolute, and not recut. Phase 4 core works. ✅

### 13-step Phase 4 Verification Checklist (unfinished)

Only steps 2/3 confirmed (extend trim). The rest need manual verification:

1. [ ] Clip opens with playhead at clip's start (not frame 0 of source)
2. [x] Right trim handle extends past original end — instant, no loading
3. [x] Left trim handle extends past original start — instant, no loading
4. [ ] Waveform doesn't stretch during trim drag
5. [ ] Trim inward (shrink) still works
6. [ ] Save → reopen → bounds persist
7. [ ] Render uses source + segments (output correct)
8. [ ] Rename source MP4, reopen clip → Media Offline banner appears
9. [ ] Banner shows missing path
10. [ ] Locate file… picks file → banner clears, video loads
11. [ ] First open: waveform peaks appear in ~seconds (FFmpeg decode)
12. [ ] Second open: waveform peaks appear instantly (cache hit)
13. [ ] `{watchFolder}/.clipflow/projects/{projectId}/.waveforms/` contains JSON cache file

---

## Logs / Debugging

- **Main log:** `%APPDATA%/clipflow/logs/app.log` — shows startup, session IDs, crashes, ExtendLeft/ExtendRight events, preview frame generation
- **Renderer debug log:** `%APPDATA%/clipflow/trim-debug.log` — from snap-to-0 investigation; renderer console mirror
- **Waveform cache:** `{watchFolder}/.clipflow/projects/{projectId}/.waveforms/`
- **Sentry:** flowve/clipflow org/project (see memory `reference_sentry_api.md` for API token). Minidumps NOT currently enabled — enabling them is part of task B2.
- **`[DBG ...]` console.log instrumentation** still present in `PreviewPanelNew.js` (play effect, tick, seek events) + `usePlaybackStore.js`. Delete in task C1.

### Crash timeline across recent sessions
```
2026-04-14 09:39:09  [sess_d99b560c1731]  (pre-Phase-4)
2026-04-14 09:39:43  [sess_e9ce9890805b]  (pre-Phase-4)
2026-04-14 09:39:59  [sess_e9ce9890805b]  (pre-Phase-4)
2026-04-14 09:41:10  [sess_d99b560c1731]  (pre-Phase-4)
2026-04-14 09:49:02  [sess_944e0f4f7f46]  (pre-Phase-4)
2026-04-14 09:56:58  [sess_5a1435657ef7]  (pre-Phase-4)
2026-04-16 02:54:04  [sess_e51546151c4d]  (post-5f408e8, pre-4e5adc9)
2026-04-16 14:51:56  [sess_81ed27726163]  (post-4e5adc9 — hardening didn't fix it)
```
Pattern: crashes happen ~2–6 min into editor work. Always exit code -1073741819.

---

## Build & Run

```bash
npx react-scripts build    # compile React → build/
npm start                  # launch Electron (loads from build/)
```

End-of-session build metrics: `505.56 kB main.js (-19 B)`, `8.72 kB main.css`. Clean.

**Note:** single-instance-lock prevents `npm start` if a previous Electron window is open. Close it first or you'll see an empty log.

---

## Tech-Level Context for Next Agent

### Phase 4 mental model (important)

Think **DaVinci Resolve / Premiere**:
- **Media pool** = `project.sourceFile` on disk, never copied, never modified.
- **Timeline clips** = `clip.nleSegments: [{ sourceStart, sourceEnd }]` — source-absolute pointers.
- **Preview** = `<video src={project.sourceFile}>`, `currentTime` is source-absolute time.
- **Extend/trim** = mutate `sourceStart` / `sourceEnd`. That's it. No FFmpeg, no I/O.
- **Render** = only time FFmpeg runs. `render.js` takes source + segments, produces final clip.
- **Transcription** = source-wide, source-absolute, done once at project creation (see `ai-pipeline.js:490`). Extends reveal already-transcribed audio with no Whisper re-run. **BUT — see B1. This promise isn't fully kept because the subtitle store filters at init time.**

### Coordinate spaces (critical to keep straight)

- **Source-absolute time** — seconds into the full OBS recording. `video.currentTime`, `nleSegment.sourceStart`, `editSegments[i].startSec`, word `start`/`end` in transcription, waveform peak indices (after scaling). Phase 4 makes this the primary space.
- **Timeline time** — seconds into the edited clip as the user perceives it. Starts at 0. Computed via `mapSourceToTimeline` / `visibleSubtitleSegments`. Used for subtitle display, timeline ruler, playhead position.
- **Clip-relative time (DEPRECATED)** — seconds into the pre-cut clip file. Was used before Phase 4. Do not introduce new code using this.
- **Display time** — what `fmtTime` renders. Currently clip-relative to `_sourceOrigin` (= `clip.startTime`). Consider whether this should change to timeline-time for UI consistency (separate discussion).

### Key stores (don't mix up)

- `useEditorStore` — project/clip, `nleSegments`, `sourceOffline`, waveform peaks, `initFromContext`, `locateSource`
- `usePlaybackStore` — `currentTime`, `playing`, `clipFileOffset` (now 0), `clipFileDuration` (now sourceDur), `mapSourceTime`, `seekTo`, `nleSegments` mirror
- `useSubtitleStore` — `editSegments` (source-absolute), `getTimelineMappedSegments()` derived, styling, undo/redo
- `useCaptionStore` — caption overlay state
- `useLayoutStore` — panel positions, drawer state
- `useSelectionStore` — current selection

6 stores total. All use selectors; **never `getState()` in render paths** (project CLAUDE.md rule).

### Things I haven't verified but suspect

- **Waveform stretch during drag (V1 step 4):** I removed `onExtendCommit` wiring but didn't verify the visual behavior. The TimelinePanelNew changes pass `clipFileDuration={sourceDuration || ...}` and `clipOrigin={0}` — waveform should render stable peaks across the full source. But eyes-on test needed.
- **Render output (V1 step 7):** Render pipeline was made NLE-aware in commit `14b436b` (pre-Phase-4). The `nleSegments`-at-import change in `ai-pipeline.js` should guarantee it always takes the NLE path. But first-end-to-end test hasn't been done with a real publish flow.
- **Media Offline flow (V1 steps 8–10):** Code shipped but never exercised. IPC bridge name matters — should be `window.clipflow.fileExists` and `window.clipflow.projectLocateSource`.

---

## Known Follow-ups (parked)

1. **B3 awaits user repro** — subtitle mismatch regression specifics.
2. **C2** — `ai-pipeline.js` Stage 7b per-clip retranscription reads `clip.filePath`. Convert to source + in/out extraction.
3. **C1 checklist:**
   - `[DBG ...]` console.logs in `PreviewPanelNew.js` (play effect, tick loop, onTimeUpdate) + `usePlaybackStore.js`
   - `commitAudioResize` and `commitLeftExtend` actions in `useEditorStore.js` (unused)
   - `clip:extend` and `clip:extendLeft` IPC handlers in `main.js` (unused after Phase 4)
   - Constants `MERGE_THRESHOLD`, `CLUSTER_GAP_PX`, `CLUSTER_MIN_WIDTH_PX` in `timelineConstants.js`
4. **C3** — post-C2 architectural question: do we still need to pre-cut clip files at import at all? Render reads from source anyway. Defer to separate planning session.
5. **Tests** — 74/74 pass as of session 3 handoff (`Phase 3D: Fix getSegmentTimelineRange API and add migration tests`). No new tests added for Phase 4. Should add: NLE-extend round-trip, Media Offline fallback path, subtitle store under extend (after B1).

---

## Watch-Outs for Next Session

- **Don't amend commits.** Always create new ones (global rule).
- **Read files before editing** (project rule). Files involved in the subtitle fix: `useSubtitleStore.js` (initSegments filter), possibly `timeMapping.js`, potentially `useEditorStore` extend actions.
- **Plan before code on bugs** (global rule). B1 has a clear root cause but the fix still needs a plan re: manual-edit preservation.
- **Two failed attempts → stop and rethink** (global rule). If B2 (crash) goes two rounds without progress, step back and consider whether `<video>` is the wrong abstraction entirely (e.g., alternative: use Media Source Extensions, or an HTMLMediaElement with specific codec hints).
- **Crash reporter** — enabling `app.setAppLogsPath` + `crashReporter.start({ submitURL, uploadToServer: true })` in `main.js` is a prerequisite for diagnosing B2 properly. Without minidumps we're guessing.
- **Session-end ritual:** update CHANGELOG (non-negotiable), HANDOFF, commit, `/cost`.

---

## Open Questions for Fega

1. What does the "subtitle mismatch" look like? Timestamp example + what you expected vs. what you saw?
2. Preference on B1 behavior: should we (a) just not filter at init (subs outside clip show up whenever extended — simpler), or (b) still bound editSegments to the current extended range and auto-expand on extend (more conservative — slightly more code)?
3. Is losing editor work to a crash blocking your testing right now? If yes, B2a (autosave) is priority 1 over B1.
