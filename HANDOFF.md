# ClipFlow — Session Handoff
_Last updated: 2026-04-18 (session 19) — "Editor UX: overlay drift + Render button + waveform error surfacing"_

---

## TL;DR

**Three editor issues fixed in one session.** None were hardening work — the pre-launch hardening arc closed in session 18. Session 19 is the first product-side session after the substrate / security baseline landed.

1. **[#65](https://github.com/Oghenefega/ClipFlow/issues/65) overlay drift on preview-panel resize — FIXED.** Canvas was using `aspectRatio: "9/16"` + `height: 100%` + `maxWidth/maxHeight: 100%`, which in a narrow flex container produced a canvas whose measured rect did not match the visible 9:16 render area. Overlays anchored at `top: ${yPercent}%` of the canvas therefore drifted off the video. Fix in [src/renderer/editor/components/PreviewPanelNew.js](src/renderer/editor/components/PreviewPanelNew.js): `ResizeObserver` on the scroll container + JS-computed largest-9:16-that-fits + apply as explicit pixel width/height in fit mode. Zoom mode (`zoom ≠ -1`) keeps the original percent-height path.
2. **[#59](https://github.com/Oghenefega/ClipFlow/issues/59) "Render" button — SHIPPED.** New button in editor topbar alongside "Queue". Exports MP4 without flipping `status: "approved"` and without enqueuing. Success toast shows the output path + "Show in folder" (reveals file in Explorer via new `shell:revealInFolder` IPC handler → `shell.showItemInFolder`). 6-second auto-dismiss.
3. **[#64](https://github.com/Oghenefega/ClipFlow/issues/64) waveform stuck on "Extracting waveform…" — INSTRUMENTED + error state surfaced.** Previously errors were silently swallowed at two layers: the `execFile` callback in [src/main/ffmpeg.js](src/main/ffmpeg.js) threw away `stderr`, and the track-1 → track-0 fallback ate the final error. Renderer's `.catch()` logged to console but never set UI state, so the timeline just kept showing "Extracting waveform…" forever. Now: main-side logs `[waveform] start/cache-hit/extracting/extracted/failed` with timings; FFmpeg stderr tail is logged on failure; IPC returns `{ peaks, cached, error }`; renderer sets `waveformError` in the editor store; `WaveformTrack` shows "Waveform unavailable" in red when `error` is set and `peaks` is empty. **Does not "fix" the extraction bug itself — it makes the bug diagnosable and keeps the UI honest.** Next time it spins, we'll see the actual FFmpeg stderr instead of guessing.

Build passed (`npm run build:renderer` → 10.04s, 2728 modules, 1.86 MB). **User verified all three**: overlays pin correctly at every preview size, Render button works (confirmed after tooltip removal — see below), waveform shows "Waveform unavailable" on the test clip instead of the infinite spinner.

### Two follow-up fixes during verification

1. **Render button tooltip removed.** The `TooltipProvider` wrapper was rendering the "Export MP4 without queuing for upload" tooltip in an awkward spot near the window chrome. The Queue button has no tooltip; parity + the "Render" label is self-explanatory. Removed just the Render tooltip, other editor tooltips untouched. [src/renderer/editor/components/EditorLayout.js:874-888](src/renderer/editor/components/EditorLayout.js).
2. **Subtitle + caption line-wrap mismatch at small preview sizes.** Root cause: `buildSubtitleStyle` had `Math.max(7, (fontSize) * scaleFactor)` and `buildCaptionStyle` had `Math.max(6, ...)`. Below certain preview widths, fontSize hit the floor while the container (`maxWidth: 90%` of canvas) continued to shrink → ratio broke → text wrapped to a second line. Removed the floors (plus the `Math.max(1, ...)` / `Math.max(2, ...)` floors on padding + borderRadius) in [src/renderer/editor/utils/subtitleStyleEngine.js](src/renderer/editor/utils/subtitleStyleEngine.js). Offscreen subtitle renderer is unaffected — it runs at 1080px canvas width where floors never triggered anyway.

### Two new bugs filed during verification (out of scope for session 19)

- [#66](https://github.com/Oghenefega/ClipFlow/issues/66) — **Transcript panel shows full source audio, not just the clip range.** User noticed the transcript tab (editor left panel) renders the entire 30-minute recording's transcription, not the portion inside the current clip. Root cause: `useSubtitleStore.initSegments` unions `project.transcription` extras into `originalSegments` intentionally (to support clip extension), and `TranscriptTab` renders all of them as if they're in-scope. Fix: filter `originalSegments` in `TranscriptTab` to segments whose `[startSec, endSec]` falls inside the union of current `nleSegments` source ranges.
- [#67](https://github.com/Oghenefega/ClipFlow/issues/67) — **Timeline zoom slider can't reach the left end, caps at ~23%.** Root cause: slider maps 0-100 to zoom 0.05x-20x (log), but `setTlZoom` floors at 0.2 — values below slider position 35 all collapse to 0.2. Fix: re-map the slider to span [0.2, 20] exactly via `zoom = 0.2 * Math.pow(100, v/100)`, inverse `value = log(zoom/0.2)/log(100) * 100`. Full slider range usable, 0.2 floor preserved.

Both are strong candidates for session 20.

## 🎯 Next session — pick one

1. **[#66](https://github.com/Oghenefega/ClipFlow/issues/66) transcript shows full source, not clip range.** Small, isolated fix — filter `originalSegments` in `TranscriptTab` by the current `nleSegments` source union. Research + plan documented in the issue body.
2. **[#67](https://github.com/Oghenefega/ClipFlow/issues/67) zoom slider caps at ~23%.** One-file change: re-map the slider 0-100 range to `[0.2, 20]` via `zoom = 0.2 * Math.pow(100, v/100)`. Quick win.
3. **[#64](https://github.com/Oghenefega/ClipFlow/issues/64) waveform root-cause.** With logging in place, reproduce, read `[waveform]` lines on main-process stdout, fix the actual FFmpeg failure mode. Should now be single-session because the error is no longer hidden.
4. **[#62](https://github.com/Oghenefega/ClipFlow/issues/62) pipeline tolerance for silent audio.** Two-part fix across [D:\whisper\energy_scorer.py](D:\whisper\energy_scorer.py) and [src/main/ai-pipeline.js](src/main/ai-pipeline.js) `runEnergyScorer`.
5. **[#61](https://github.com/Oghenefega/ClipFlow/issues/61) recording-date folder bucket + one-shot migration** to re-bucket misfiled months.
6. **[#57](https://github.com/Oghenefega/ClipFlow/issues/57) editor perf on long source.** Component extraction per [#57 comment 4267674430](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430). Do **NOT** retry the store-derivation approach.
7. **[#63](https://github.com/Oghenefega/ClipFlow/issues/63) sandbox the overlay window.** Defense-in-depth follow-up to H1.

**Suggested combo:** #66 + #67 in one session. Both small, both editor UX papercuts the user just hit, independent files. #64 root-cause is also a strong candidate if the user wants the waveform fully working end-to-end.

## 🚫 DO NOT touch next session (preserved)

- **Do NOT retry the [#57](https://github.com/Oghenefega/ClipFlow/issues/57) store-derivation approach** in any form. Rejected — session 11 broke it twice.
- **Do NOT skip the zoom-slider drag × 10 on a 30-minute source.** Standing go/no-go for any Electron / build-tool / dependency infrastructure change.
- Do NOT touch [#50](https://github.com/Oghenefega/ClipFlow/issues/50), [#56](https://github.com/Oghenefega/ClipFlow/issues/56), or [#51](https://github.com/Oghenefega/ClipFlow/issues/51). All deferred per pre-beta priority framing.
- **chokidar 5.x is off-limits** until Electron bumps its bundled Node to ≥ 20.19.
- **Do NOT re-introduce top-level `new Store(...)` calls.** electron-store is ESM-only now.
- **Do NOT flip `nodeIntegration: true → false` on any BrowserWindow without explicitly deciding `sandbox: true` vs `sandbox: false`.** Electron ≥20 defaults unset sandbox to `true` when `nodeIntegration` is off, which strips `require("path")` and most Node built-ins from the preload.
- **Do NOT add inline `onclick=`, `onerror=`, or `<script>` blocks to any renderer HTML.** H2 CSP (`script-src 'self'`) blocks them. Use `addEventListener` with an `id`.
- **Do NOT loosen CSP without auditing the full payload chain.** Whitelist narrowly (exact subdomain, not `*`) and only on the directives the SDK actually needs.
- **Do NOT rely on `frame-ancestors` in the meta-tag CSP.** Meta-delivered CSP cannot carry `frame-ancestors` per spec.
- **Do NOT restore the old canvas styling in PreviewPanelNew.js** (single `aspectRatio` + `height: 100%`). That's the regression path for #65. The `ResizeObserver` + JS-computed pixel dims in fit mode is load-bearing.
- **Do NOT silently `.catch(() => {})` on `waveform:extractCached`, `ffmpegExtractWaveformPeaks`, or any long-running IPC that drives a visible "loading" UI.** If an error is dropped, the UI stays in the loading state forever. Always either surface to state or log with enough context to diagnose.

## 📋 Issue board state after this session

| Item | Issue | Status |
|---|---|---|
| **C1 Electron upgrade arc** | [#45](https://github.com/Oghenefega/ClipFlow/issues/45) | ✅ closed session 12 |
| **C2 Vite migration** | [#46](https://github.com/Oghenefega/ClipFlow/issues/46) | ✅ closed session 13 |
| **H5 electron-store 8→11** | [#52](https://github.com/Oghenefega/ClipFlow/issues/52) | ✅ closed session 16 |
| **H6 chokidar 3→4** | [#53](https://github.com/Oghenefega/ClipFlow/issues/53) | ✅ closed session 15 |
| **H1 offscreen subtitle harden** | [#47](https://github.com/Oghenefega/ClipFlow/issues/47) | ✅ closed session 17 |
| **H3 main-window sandbox** | [#49](https://github.com/Oghenefega/ClipFlow/issues/49) | ✅ closed session 17 |
| **H2 renderer CSP** | [#48](https://github.com/Oghenefega/ClipFlow/issues/48) | ✅ closed session 18 — hardening arc complete |
| **#65 subtitle/caption anchor drift + scale floor** | [#65](https://github.com/Oghenefega/ClipFlow/issues/65) | ✅ closed session 19 |
| **#59 editor render without queuing** | [#59](https://github.com/Oghenefega/ClipFlow/issues/59) | ✅ closed session 19 |
| **#64 waveform extraction stuck** | [#64](https://github.com/Oghenefega/ClipFlow/issues/64) | 🟡 instrumented + error-surfaced session 19; root cause pending |
| **#66 transcript shows full source not clip range** | [#66](https://github.com/Oghenefega/ClipFlow/issues/66) | 🔲 **filed this session; plan in issue body** |
| **#67 zoom slider caps at ~23%** | [#67](https://github.com/Oghenefega/ClipFlow/issues/67) | 🔲 **filed this session; plan in issue body** |
| **#63 overlay-window sandbox** | [#63](https://github.com/Oghenefega/ClipFlow/issues/63) | 🔲 defense-in-depth follow-up; not blocking |
| **#57 editor perf on long source** | [#57](https://github.com/Oghenefega/ClipFlow/issues/57) | 🔲 UNRESOLVED — proper fix direction documented, deferred |
| **#61 monthly folder = recording date** | [#61](https://github.com/Oghenefega/ClipFlow/issues/61) | 🔲 ready |
| **#62 pipeline silent-audio tolerance** | [#62](https://github.com/Oghenefega/ClipFlow/issues/62) | 🔲 ready |

## ✅ What was built this session

### Files touched

- [src/renderer/editor/components/PreviewPanelNew.js](src/renderer/editor/components/PreviewPanelNew.js) — `ResizeObserver` + `fitSize` useMemo; canvas inline styles now use explicit pixel width/height in fit mode. Also wired `setWaveformError` into the extraction call site (success clears, failure sets).
- [src/renderer/editor/components/EditorLayout.js](src/renderer/editor/components/EditorLayout.js) — new Render button beside Queue; `doRender(addToQueue)` helper (was `doQueueAndRender`); `lastRender` state + 6s auto-dismiss; render-success toast with "Show in folder".
- [src/main/preload.js](src/main/preload.js) — added `revealInFolder` bridge.
- [src/main/main.js](src/main/main.js) — added `shell:revealInFolder` IPC handler; rewrote `waveform:extractCached` with `[waveform]` log prefix at start / cache / extracting / extracted / failed with timings.
- [src/main/ffmpeg.js](src/main/ffmpeg.js) — `extractWaveformPeaks` captures `stderr` via the 3rd `execFile` callback arg; logs last 800 bytes on failure; track-1 → track-0 fallback now returns `{ peaks: [], error }` instead of swallowing.
- [src/renderer/editor/stores/useEditorStore.js](src/renderer/editor/stores/useEditorStore.js) — added `waveformError` state + `setWaveformError` action; reset on clip open.
- [src/renderer/editor/components/TimelinePanelNew.js](src/renderer/editor/components/TimelinePanelNew.js) — subscribes to `waveformError`, passes as prop to `<WaveformTrack>`.
- [src/renderer/editor/components/timeline/WaveformTrack.js](src/renderer/editor/components/timeline/WaveformTrack.js) — accepts `error` prop; renders "Waveform unavailable" in red when `peaks` is empty AND `error` is set; `useEffect` deps + `React.memo` comparator include `error`.
- [CHANGELOG.md](CHANGELOG.md), [HANDOFF.md](HANDOFF.md), [tasks/todo.md](tasks/todo.md).

## 🔑 Key decisions this session

1. **#65 fix uses explicit pixel dims, not `aspectRatio`.** The Chromium aspect-ratio reconciliation inside a narrow flex container with `maxWidth/maxHeight: 100%` is the root cause. JS-computed pixel values remove the ambiguity — same result, deterministic.
2. **#59 "Render" does NOT flip `status: "approved"`.** Only the Queue path does. Render is a pure export. This keeps the clip status model clean: Approved means "committed to queue flow"; a Render-only export doesn't imply that intent.
3. **#59 success toast uses `shell.showItemInFolder`, not `shell.openPath`.** The user wanted to see the file in Explorer (highlighted), not open the folder silently. `showItemInFolder` matches the Windows "Show in folder" UX everywhere else.
4. **#64 instrumented instead of patched.** The extraction sometimes succeeds; when it fails, the failure is silent. Adding error surfacing + stderr capture is the right first move — fixing an unknown failure mode is guesswork. Next session can diagnose from real logs.
5. **Waveform error state is global (Zustand store), not local to PreviewPanelNew.** Because `WaveformTrack` lives under `TimelinePanelNew`, and both are deep children of the editor. Passing through props would cross three component boundaries. Store fits the existing pattern (`waveformPeaks` is already in the store).

## ⚠️ Watch out for

- **#65 fix is fit-mode only.** The JS-computed pixel path runs when `zoom === -1`. In zoom mode, the code still uses `aspectRatio` + `height: ${zoom}%`. That path is untouched and appears to work correctly because the zoom modes set a fixed height percentage, which Chromium resolves unambiguously. If zoom mode ever starts drifting, revisit — same fix shape applies.
- **Waveform extraction still fails on some opens.** Only the UX is improved. When the red "Waveform unavailable" text appears, check main-process stdout for `[waveform] failed:` + the stderr tail. Likely causes: source has no audio track, audio track index assumption is wrong, or ffprobe-less path mismatch. See `ffmpeg.js` `extractWaveformPeaks` and its caller in `main.js`.
- **Do not assume the IPC contract on `waveformExtractCached`.** It now returns `{ peaks, cached, error }`. Older callers that only read `result.peaks` still work (they fall through to the error branch when `peaks` is empty). Any new caller should handle `error`.
- **Render button fragment in EditorLayout assumes `onRenderOnly` and `onSendToQueue` are wired.** If a future refactor collapses the fragment into a single button, make sure both handlers still exist — `doRender(true)` and `doRender(false)` are not interchangeable (they differ on the clip-status flip).

## 🪵 Logs / Debugging

- **Waveform flow (new this session):** grep main-process stdout for `[waveform]`. Sequence on success: `[waveform] start projectId=… file=… dur=…` → `[waveform] cache hit peaks=… cached=true` **or** `[waveform] extracting peakCount=… track=…` + `[waveform] extracted peaks=… ms=…`. Sequence on failure: `[waveform] start …` → `[waveform] ffmpeg exit (track N): code=… msg=…` + `[waveform] ffmpeg stderr tail:\n…` + `[waveform] failed: … ms=…`. The renderer shows "Waveform unavailable" in red on the timeline waveform row.
- **Main-process stdout** also catches overlay preload failures (`[OverlayRenderer:*]`) and Electron's own `Unable to load preload script:` errors.
- **Per-video pipeline logs:** `C:\Users\IAmAbsolute\Desktop\ClipFlow\processing\logs\<VideoName>_<timestamp>.log`. One file per pipeline run.
- **Electron main logs:** `C:\Users\IAmAbsolute\AppData\Roaming\clipflow\logs\app.log` — startup, database init, watcher events. Does NOT contain subprocess stderr.
- **Renderer DevTools in production builds:** `CLIPFLOW_DEVTOOLS=1 npm start`. Waveform console.warn from the renderer side will appear here with prefix `[waveform]`.

## 🔄 Build & verify

```bash
npm install                          # only if dep versions changed
npm run build:renderer               # Vite build (~10s, 2728 modules, 1.86MB minified)
npm start                            # Launch Electron (prod mode)
CLIPFLOW_DEVTOOLS=1 npm start        # Launch with DevTools attached
```

Main-process changes (anything under `src/main/`) require a full Electron quit + relaunch. Overlay preload changes also require a full relaunch — Vite HMR doesn't reach the offscreen window.

**Standing verification matrix — session 19 adds three items:**
1. OBS real-record for 30s → Stop → card appears on Rename tab ~1-2s later.
2. Zoom-slider drag × 10 on a 30-min source — no renderer crash.
3. Drop-to-Rename and drop-to-Recordings land correctly under sandbox.
4. Render a clip with subtitles ON — burn-in matches preview (H1 regression canary).
5. Click every main tab — no "Something went wrong" screens.
6. DevTools Issues tab shows "No Issues" (H2 CSP canary).
7. **NEW (#65): open editor on a clip → drag the preview-panel resizer both directions → subtitle + caption overlays stay pinned to the 9:16 video rect, never drift off.**
8. **NEW (#59): click Render (not Queue) → confirm export completes → toast appears with path + "Show in folder" button → button opens Explorer with file highlighted → clip status in Queue view did NOT flip to Approved.**
9. **NEW (#64): open a fresh clip → watch main-process stdout for `[waveform]` sequence; if extraction fails, timeline shows "Waveform unavailable" in red, NOT the infinite spinner.**
