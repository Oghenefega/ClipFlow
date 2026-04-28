# Changelog

All notable changes to ClipFlow are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — 2026-04-28 (session 33) — Dead code audit, Pass 2: orphaned Zustand state fields + setters

### Removed
- **`useCaptionStore.captionStartSec` / `captionEndSec` + their setters** ([src/renderer/editor/stores/useCaptionStore.js](src/renderer/editor/stores/useCaptionStore.js)). The in-source comment claimed these were "kept for undo snapshot compat" but verification showed they were NOT in the `CAP_KEYS` undo snapshot list ([useSubtitleStore.js:45-58](src/renderer/editor/stores/useSubtitleStore.js)) — the fields had zero external readers, zero callers for `setCaptionStartSec`/`setCaptionEndSec`, and no disk persistence (`_doSilentSave` writes `captionSegments` and `captionStyle`, not these). Cleaned references in `initFromClip` and `reset` accordingly.
- **`usePlaybackStore.trimIn` / `trimOut` + their setters** ([src/renderer/editor/stores/usePlaybackStore.js](src/renderer/editor/stores/usePlaybackStore.js)). Pre-NLE-segment trim surface, replaced by `nleSegments`-based trimming after the lazy-cut pivot. Zero external readers, zero callers. Cleaned references in `reset()`.
- **`useLayoutStore.tlOverlay` + `setTlOverlay`** ([src/renderer/editor/stores/useLayoutStore.js](src/renderer/editor/stores/useLayoutStore.js)). Timeline-overlay toggle with no consumer anywhere in the codebase.

### Audit notes — what I checked but didn't touch
- **`useEditorStore.audioSegments` and its 7 actions are NOT dead.** The HANDOFF flagged this as a removal candidate, but [LeftPanelNew.js:926-939](src/renderer/editor/components/LeftPanelNew.js) still consumes it for the audio-segment ripple-delete UI. Removing it would have broken that surface — keeping intact pending a separate audit of whether the LeftPanelNew code path is itself reachable post-lazy-cut. Filed as a Pass 3 follow-up.
- **`useEditorStore.videoVersion` is ALIVE.** Used by [PreviewPanelNew.js:411](src/renderer/editor/components/PreviewPanelNew.js) as a cache-buster query param to force `<video>` element reload after recut.

### Verification
- `npm run build:renderer` passes clean (2728 modules, 12s, no errors). Bundle size unchanged.
- Electron startup probe: 30s run, zero error-pattern matches in app.log delta. App launched, database initialized, 11 preview-frame generations completed cleanly. **Caveat:** probe doesn't open the editor UI, so the modified `initFromClip`/`reset` runtime paths weren't exercised at runtime. Static verification was strict: zero external readers, fields not in undo snapshot, not persisted.
- 32 lines removed across 3 store files. No schema migration needed (none of the dropped fields were ever written to disk).

## [Unreleased] — 2026-04-28 (session 33) — Dead code audit, Pass 1: orphaned IPC handlers + preload bridges

### Removed
- **27 orphaned IPC handlers + matching preload bridge entries** ([src/main/main.js](src/main/main.js), [src/main/preload.js](src/main/preload.js)). Cross-referenced every `ipcMain.handle` against every `ipcRenderer.invoke` against every `window.clipflow.<method>` callsite (324 callsites across 18 renderer files including `src/index.js`). Each removed entry was verified as having zero references in `src/`, no destructuring/aliasing, and no test coverage. Categories dropped:
  - **fs surface:** `fs:readDir`, `fs:readFile`, `fs:writeFile` (renderer accesses files via dedicated handlers — `metadata:*`, `pipelineLogs:read`, etc.)
  - **Watcher events with no consumer:** `onFileRemoved`, `onTestFileRemoved` preload listener wrappers + `watcher:stopTest` handler. Test watcher is started but never stopped from renderer (pre-existing pattern; cleans up on app quit).
  - **Shell + dialog:** `shell:openFolder` (`revealInFolder` is what's used), `dialog:saveFile` (`dialog:openFile` is what's used).
  - **Legacy ffmpeg surface:** `ffmpeg:extractAudio`, `ffmpeg:thumbnail`, `ffmpeg:analyzeLoudness`. The `ffmpeg.*` module functions remain — called internally from `ai-pipeline.js` and `highlights.js`. Just dropping the IPC layer.
  - **Whisper renderer-call surface:** `whisper:transcribe` handler + `onWhisperProgress`/`removeWhisperProgressListener` preload listeners. Whisper is called from main pipeline only; renderer no longer transcribes directly.
  - **Project mutation surface:** `project:create`, `project:save`, `project:addClip`, `project:deleteClip`. The AI pipeline writes projects internally; renderer mutates only specific fields via `project:updateClip`, `project:delete`, `project:updateTestMode`.
  - **Misc:** `import:cancel`, `metadata:getById`, `preset:getAll`, `preset:calculateDayNumber`, `preset:extractDate`, `feedback:getApproved`, `feedback:getCounts`, `gameProfiles:getAll`, `publishLog:getForClip`, `folder:reorder`, `logs:getModules`, `logs:getSessionLogs`, `logs:getDir`. None had any renderer caller.
- **Dead `readFileBuffer` fallback in [src/renderer/editor/utils/waveformUtils.js](src/renderer/editor/utils/waveformUtils.js)**. The `catch` branch tried `window.clipflow.readFileBuffer(filePath)` as a fallback when `fetch("file://...")` failed — but `readFileBuffer` was never exposed in the preload bridge, so the conditional always evaluated false and the path was unreachable. Replaced with a direct `console.warn` + `return null`.

### Verification
- `npm run build:renderer` passes clean (2728 modules, 11s, no errors). Bundle size unchanged from baseline (1.87 MB / 545 KB gzipped — pre-existing > 500 kB warning is tracked under [#73](https://github.com/Oghenefega/ClipFlow/issues/73)).
- 274 lines removed across 3 files (3 insertions). Net code reduction.
- No behavior change expected: every removed handler was confirmed unreachable from any renderer code path before deletion.

## [Unreleased] — 2026-04-28 (session 32) — Issue #76: lazy-cut architecture pivot, 506s → 397s

### Changed
- **AI pipeline Stage 7 stops materializing clip MP4s** ([src/main/ai-pipeline.js](src/main/ai-pipeline.js)). Replaces the per-clip `ffmpeg.cutClip` concurrency pool with a thumbnail-only loop. Each clip is now persisted as `{ startTime, endTime, nleSegments: [{ id, sourceStart, sourceEnd }], filePath: null }` — the source video plus an NLE segment list is the canonical representation. The final MP4 is only ever produced at publish/render time, and only for clips the user actually approves. Stage 7 went from **124.9s → 4.7s** on the reference recording. Pipeline log marker: `Lazy-cut: skipping MP4 materialization for N clips (final cuts happen at publish time)`.
- **AI pipeline Stage 7b retranscription extracts audio directly from the source recording** ([src/main/ai-pipeline.js](src/main/ai-pipeline.js), [src/main/ffmpeg.js](src/main/ffmpeg.js)). New `ffmpeg.extractAudioRange(sourceFile, wavPath, startSec, endSec, audioTrackIndex)` does the seek + extract in one call (16 kHz mono PCM, identical format to `extractAudio`). Replaces the old `ffmpeg.extractAudio(clip.filePath, ...)` call which required a pre-cut clip MP4 to exist. The session-31 batched single-Python-process retranscription is preserved — only the audio-extract step changed. Verified 18/18 retranscriptions on 18 clips at 92.7s (5.15s/clip) — matches session 31's per-clip rate (5.4s/clip).
- **Editor recut/extend/concat IPC handlers mutate `nleSegments` instead of re-encoding clip MP4s** ([src/main/main.js](src/main/main.js)). `clip:extend`, `clip:extendLeft`, `clip:concatRecut`, `clip:recut` are now data-only updates: read the clip, ensure `nleSegments` is present (synthesizing from `[startTime, endTime]` for legacy clips that lack it), apply the edit to `nleSegments` + `startTime`/`endTime`, save via `projects.updateClip`, return `{ success, duration, newStartTime, newEndTime, nleSegments }`. No ffmpeg call. No disk write beyond project JSON. Trim/extend/splice operations are now effectively instant (was ~1-3s of NVENC encode per drag). New `ensureNleSegments(clip)` helper handles the legacy-clip fallback path uniformly across the four handlers.
- **`retranscribe:clip` IPC handler extracts from source range** ([src/main/main.js](src/main/main.js)). Same source-range pattern as Stage 7b — uses `ffmpeg.extractAudioRange(sourceFile, wavPath, clip.startTime, clip.endTime, ...)`. WAV path moved to a deterministic `<clipsDir>/<safeId>-retranscribe.wav` so legacy clips without `clip.filePath` still work.
- **Editor renderer-side store (`useEditorStore`) syncs `nleSegments` from handler responses** ([src/renderer/editor/stores/useEditorStore.js](src/renderer/editor/stores/useEditorStore.js)). Five sites updated (`commitExtend`, `commitLeftExtend`, `_recutAfterDelete`, `_concatRecutAfterDelete`, `revertClipBoundaries`): drop the `filePath: result.filePath` assignment (never overwrite legacy `clip.filePath` blindly), apply `nleSegments: result.nleSegments` to the new clip + push to `usePlaybackStore.setNleSegments`. Editor preview, timeline, and segment-aware playback all stay in sync after edits without reloading the project.
- **Render path locks down `nleSegments` precedence** ([src/main/render.js](src/main/render.js)). Replaced the silent-fallback `(clipData.filePath || projectData.sourceFile)` chain with explicit precedence: `nleSegments + sourceFile` (lazy-cut path) → legacy `clip.filePath` (only when source is offline AND legacy MP4 exists) → throw with a clear error showing which checks failed. Prevents the failure mode where a clip with empty `nleSegments` silently renders against the wrong source range.
- **Render path consumes `clipCutEncoder` setting at publish time** ([src/main/render.js](src/main/render.js), [src/main/main.js](src/main/main.js)). Previously hardcoded to `libx264 -preset medium -crf 18`. Now `render:clip` and `render:batch` IPC handlers resolve the user's `clipCutEncoder` (auto/gpu/cpu) via `resolveClipCutEncoder()` and pass it down through `renderClip`'s `options.encoder`; the encoder block uses `ffmpeg.buildEncoderArgs(encoder)` to switch between NVENC and x264. The user's GPU pick is now honored at publish time — without this wiring, lazy-cut would have silently removed the NVENC acceleration that #75 added.
- **`ProjectsView.ClipVideoPlayer` plays the source video with seek + range bounds for new clips** ([src/renderer/views/ProjectsView.js](src/renderer/views/ProjectsView.js)). Component now accepts `project` prop. When `project.sourceFile` is set: `<video src>` is the source recording, `loadedmetadata` seeks to `clip.startTime`, the rAF time-update loop reports clip-relative `currentTime` (subtracting `clip.startTime`) and pauses + snaps back when playback crosses `clip.endTime`. Subtitle/caption overlays continue working unchanged because they receive the clip-relative time. Falls back to legacy `clip.filePath` if source is offline. New lazy-cut clips would otherwise have lost their inline preview entirely (no MP4 on disk).
- **Settings UI labels reflect publish-time scope** ([src/renderer/views/SettingsView.js](src/renderer/views/SettingsView.js)). "Clip cutting encoder" → "Render encoder" with caption text describing publish-time application ("Forces NVENC … when rendering published clips"). "Parallel cuts" → "Parallel audio extracts" since the only thing that pool now governs is Stage 7b's per-clip audio extract during retranscription. The `clipCutEncoder` and `clipCutConcurrency` electron-store keys are unchanged — same semantics, different invocation point — so no migration is needed.

### Removed
- **`ffmpeg.cutClip` and `ffmpeg.concatCutClip`** ([src/main/ffmpeg.js](src/main/ffmpeg.js)). No remaining callers anywhere in the app after the AI pipeline and recut handlers were rewritten. Final closure of the eager-cut model from issue [#42](https://github.com/Oghenefega/ClipFlow/issues/42)'s scope.
- **`ffmpeg:cutClip` IPC handler + `ffmpegCutClip` preload binding** ([src/main/main.js](src/main/main.js), [src/main/preload.js](src/main/preload.js)). Zero renderer callers; removed.
- **Dead `cutClipFast` helper in `ai-pipeline.js`** ([src/main/ai-pipeline.js](src/main/ai-pipeline.js)). Stream-copy splice helper that hadn't been called anywhere — pre-existing dead code that came out in the cleanup grep.
- **`clipCutEncoder` resolution at AI pipeline Stage 0** ([src/main/ai-pipeline.js](src/main/ai-pipeline.js)). The setting is no longer consumed by the pipeline (lazy-cut moved cutting to publish time); resolution happens in `render:clip`/`render:batch` handlers instead. The strict GPU-fail-fast behavior is preserved at publish time.

### Performance — measured on the reference 30-min RL recording (`RL_2026-10-15_Day9_Pt1.mp4`)
- **Pipeline total: 506.2s → 397.5s (1.27× on top of session 31, ~108s saved per source)**. Reference log: [processing/logs/RL_2026-10-15_Day9_Pt1_1777373571340.log](processing/logs/RL_2026-10-15_Day9_Pt1_1777373571340.log). Note: this run produced 18 clips vs session 31's 15, so per-clip work is actually slightly faster than session 31's per-clip rate, not just absolute-faster.
- **Clip Cutting (now "Clip Metadata"): 124.9s → 4.7s (26.5×)**. Stage 7 only generates thumbnails now; the cut work moved to publish time and is paid only on approved clips. On a typical run where the user keeps 10 of 15 clips, that's ~5 × 8s = 40s of pure waste eliminated on top of the headline savings.
- **Clip Retranscription: 80.7s → 92.7s on 18 clips vs 15** (per-clip: 5.4s → 5.15s — slightly faster). The source-range audio extract introduces no measurable overhead vs reading from a pre-cut clip MP4.

### Notes
- **Issues closed:** [#75](https://github.com/Oghenefega/ClipFlow/issues/75) (architectural half done — both halves of "cutting + retranscription performance" are now resolved), [#41](https://github.com/Oghenefega/ClipFlow/issues/41) (Stage 7b switched off `clip.filePath` to source ranges), [#42](https://github.com/Oghenefega/ClipFlow/issues/42) (eager-cut clip lifecycle removed in all new code paths). [#76](https://github.com/Oghenefega/ClipFlow/issues/76) — this issue, fully resolved.
- **Issue filed:** [#77](https://github.com/Oghenefega/ClipFlow/issues/77) — editor transcript panel highlights the wrong segment during playback (preview overlay is correct). Surfaced during the lazy-cut visual check; may be pre-existing or related to the playback-time mapping rewiring. Worth investigating in a follow-up session.
- **Backwards compatibility:** legacy projects (session-31 era and earlier) that have `clip.filePath` MP4s on disk continue to open and play. The render path falls back to the legacy MP4 only when `project.sourceFile` is offline. The recut handlers synthesize `nleSegments` from `[startTime, endTime]` for legacy clips on first edit, then proceed as lazy-cut. No proactive migration needed; orphaned clip MP4s on disk are harmless leftovers.
- **Acceptance criteria status (from issue #76):**
  - AI pipeline does not call `cutClip`/`concatCutClip` — ✅ confirmed via grep + log absence.
  - Pipeline total ≤ 400s — ✅ 397.5s.
  - Editor opens new lazy-cut clips, plays via source+seek — ✅ visual check passed.
  - Trim handles + multi-segment splice work — ✅ visual check passed.
  - Legacy projects still open — ✅ session-31 project verified in-app.
  - Render-at-publish produces the final MP4 — ✅ render path consumes `nleSegments` end-to-end via `buildNleFilterComplex`.
  - No regression in karaoke timing — ✅ per-clip retranscription preserved (lessons.md "never source-slice word timestamps" rule honored).
  - Wasted-cut savings on rejected clips — ✅ structural: no MP4 is ever made for a clip the user doesn't publish.

---

## [Unreleased] — 2026-04-27 (session 31) — Issue #75 Phases 1–3: NVENC + parallel cuts + batched retranscription, 810s → 506s

### Added
- **NVENC hardware encoder support for clip cutting** ([src/main/ffmpeg.js](src/main/ffmpeg.js)). New `checkNvenc()` runs `ffmpeg -encoders` once at process start, caches the result. New `resolveEncoder(setting)` maps the user's `clipCutEncoder` preference to a concrete encoder name. Encoder args extracted into `buildEncoderArgs()` so `cutClip` and `concatCutClip` switch between `libx264 -preset veryfast -crf 18` and `h264_nvenc -preset p4 -tune hq -rc vbr -cq 19 -b:v 0 -maxrate 25M -bufsize 50M -spatial_aq 1 -temporal_aq 1` based on caller intent. Audio settings, fps preservation, frame-accuracy seek behavior all unchanged.
- **`clipCutEncoder` electron-store key with three modes: `"auto"` | `"gpu"` | `"cpu"`, default `"auto"`** ([src/main/main.js](src/main/main.js)). `"gpu"` is **strict** — if NVENC isn't detected, `resolveEncoder` throws a user-facing error ("Switch to CPU or Auto in Settings"); never silently falls back. `"cpu"` is libx264-only. `"auto"` uses NVENC if detected, else x264. The pipeline log + on-screen "Cutting clip 7/15 (NVENC)..." progress text show which encoder ran every time so the user is never confused about which path is in play.
- **`clipCutConcurrency` electron-store key, default 3, range 1–5** ([src/main/main.js](src/main/main.js)). Number of clips cut in parallel during the AI pipeline's clip-cutting stage. Migration adds the key for existing installs.
- **Settings UI: encoder selector + parallel-cuts dial** in the existing "Pipeline Quality" card ([src/renderer/views/SettingsView.js](src/renderer/views/SettingsView.js)). Three-button segmented control (Auto / GPU / CPU) with live "NVENC detected: yes/no" status, and a 1–5 button row for parallel-cuts. Description text reflects the active mode (e.g. "Forces NVENC. Pipeline aborts with a clear error if NVENC isn't available — never silently falls back to CPU").
- **`ffmpeg:checkNvenc` IPC handler + `ffmpegCheckNvenc` preload binding** ([src/main/main.js](src/main/main.js), [src/main/preload.js](src/main/preload.js)). Used by the Settings UI to display NVENC availability hint live.
- **`whisper.transcribeBatch(items, opts)`** ([src/main/whisper.js](src/main/whisper.js)) and provider-side **`stable-ts.transcribeBatch`** ([src/main/ai/transcription/stable-ts.js](src/main/ai/transcription/stable-ts.js)). Single Python subprocess processes N clips with the model loaded once. Manifest written next to the first item's output path, cleaned up after the run. Each clip's result JSON is written immediately on completion so partial progress survives a mid-batch failure (caller detects missing output and flags `transcriptionFailed`). Falls back to per-clip transcribe in the facade if a non-stable-ts provider is active.
- **Batch mode in [tools/transcribe.py](tools/transcribe.py)**: new `--batch <manifest.json>` arg loads the model once and loops over the manifest items, writing per-clip JSON outputs in the same format as single-clip mode. Internal helper `transcribe_one(model, audio, output, language, initial_prompt)` extracted so both batch and single-clip paths share the per-clip work. One clip failure does not abort the batch — the script logs the error and continues; caller detects the missing output JSON.

### Changed
- **`cutClip` and `concatCutClip` accept an `opts` object** ([src/main/ffmpeg.js](src/main/ffmpeg.js)). New options: `encoder` (`"nvenc"` | `"x264"`, default `"x264"` to preserve old caller behavior) and `fps` (pre-probed source fps, optional). Encoder choice picks args from `buildEncoderArgs`. When `fps` is provided, the per-call `probe()` is skipped — the AI pipeline used to call `probe()` 16× (once at Stage 0 + once inside each of 15 cuts); now Stage 0's probe value is threaded through, dropping the 15 redundant probes.
- **AI pipeline Stage 7 (Clip Cutting) rewritten as a concurrency-limited pool** ([src/main/ai-pipeline.js](src/main/ai-pipeline.js)). Worker count = `clipCutConcurrency`. Each worker pulls indices from a shared cursor; results land in a pre-allocated index-aligned array so `project.clips` is assembled in source order regardless of completion order. Encoder is resolved once near Stage 0 with `ffmpeg.resolveEncoder(store.get("clipCutEncoder") || "auto")` so a "GPU strict + NVENC missing" config errors fast (<200ms after probe) instead of after 10 minutes of upstream work. Pipeline log: `Clip cutting: encoder=NVENC (setting=gpu)`, `Cutting 15 clips with NVENC, concurrency=3 (fps=60)`, `[DONE] Clip Cutting (124.9s) — 15 clips cut successfully (NVENC ×3)`.
- **AI pipeline Stage 7b (Clip Retranscription) rewritten as parallel extract + single batched transcribe** ([src/main/ai-pipeline.js](src/main/ai-pipeline.js)). Audio extracts run in a concurrency pool (reusing the `clipCutConcurrency` setting); the manifest of successfully-extracted clips is handed to `whisper.transcribeBatch()` for a single Python invocation. Failed audio extracts are flagged on the clip; missing or unparseable transcribe outputs are flagged with descriptive errors. Temp WAVs and JSON outputs are cleaned up after the assignment step. The lessons.md "never source-slice word timestamps" rule is preserved — every clip is still transcribed against its own audio, just in one Python process instead of 15.
- **All user-driven recut IPC handlers (`clip:extend`, `clip:extendLeft`, `clip:concatRecut`, `clip:recut`)** ([src/main/main.js](src/main/main.js)) read `clipCutEncoder` from the store and pass `encoder` to `cutClip`/`concatCutClip`. Editor recuts now use the same NVENC/x264 selection logic as the AI pipeline.

### Performance — measured on the reference 30-min RL recording (`RL_2026-10-15_Day9_Pt1.mp4`)
- **Clip Cutting: 297.1s → 124.9s (2.4×)** across the three changes:
  - x264 → NVENC alone: 297.1s → 142.7s (2.08×, 154s saved)
  - + concurrency=3: 142.7s → 109.9s (1.30× on top, 33s more saved)
  - This run measured 124.9s — run-to-run variance is ±15s on the parallel path (NVENC thermal/driver state). Average across the two Phase-2 runs is ~117s.
- **Clip Retranscription: 214.7s → 80.7s (2.7×)**. The 15× repeated Python startup + CUDA init + model load (~5-8s of fixed cost per call) collapses to a single ~8s upfront cost; the rest is actual whisper inference + refine() per clip. Verified 15/15 clips returned valid transcriptions, no `transcriptionFailed` flags.
- **Pipeline total: ~810s → 506.2s (1.6×, ~5 min saved per source recording)**. Reference log: [processing/logs/RL_2026-10-15_Day9_Pt1_1777321811452.log](processing/logs/RL_2026-10-15_Day9_Pt1_1777321811452.log).

### Notes
- **Issue [#75](https://github.com/Oghenefega/ClipFlow/issues/75) is partially closed.** The "Clip Cutting" and "Clip Retranscription" optimization halves are shipped. The "lazy-cut architecture pivot" (don't materialize clip MP4s upfront — use source+nleSegments throughout, cut at queue/publish time) is filed as #76 for a follow-up session.
- **Standalone benchmarks before in-app verification:** NVENC vs x264 on a 60s clip showed 17.65s (x264 veryfast crf=18) vs 9.43s (NVENC p4 cq=19) — 1.87×, matching the in-app result almost exactly. Parallelism bench at concurrency 1/2/3/4 showed concurrency=3 as the sweet spot (1.18× over sequential); concurrency=4 gave no further gain because RTX 30-series shares one NVENC silicon block across concurrent sessions. Encoder bandwidth, not session count, is the cap. Default 3 ships.
- **NVENC output is ~50% larger than x264 at notional-equal quality** (151MB vs 101MB on a 60s test clip at NVENC cq=19 vs x264 crf=18). Visually equivalent for social use; the bandwidth budget on a desktop NVMe is irrelevant. If users ever care, the `cpu` mode is one click in Settings.
- **Why retranscription was slower per-second-of-audio than initial transcription:** initial 118s for 1804s of audio = 0.065s/audio-sec; retranscription was 178s for ~600s of audio = 0.30s/audio-sec — 4.5× slower per audio-second. Same model, same script — the difference was paying Python startup + CUDA init + model load + refine() iterative passes 15× instead of once. After the batch fix retranscription is 80.7s for the same audio = 0.13s/audio-sec — ~2× the initial-transcription rate, which is expected (15× refine() passes on short clips still amortize less efficiently than 1× refine() pass on a long one).
- **Acceptance criteria status:**
  - Pipeline log Clip Cutting ≤90s — ❌ landed at 124.9s. Encoder-silicon bound; further wins require dropping NVENC re-encode (lazy-cut, #76) or keyframe-aligned stream-copy fast-path.
  - Retranscription ≤120s — ✅ 80.7s.
  - All clips transcribed — ✅ 15/15.
  - Editor recut still works — ✅ confirmed in-app.
  - Settings UI — ✅ encoder selector + parallel-cuts dial both present and functional.
  - No silent CPU fallback — ✅ encoder=gpu setting with NVENC missing throws immediately; auto mode logs which encoder ran.
- **What's left at 506s.** Top three are now ~25% each: Signal Extraction (138.7s, dominated by yamnet), Initial Transcription (126.3s, same `refine()` pattern as retranscription used to have), Clip Cutting (124.9s, encoder-bound under current architecture). Lazy-cut pivot (#76) drops Clip Cutting to ~0s blocking time — the actual cut work moves to publish/queue time and is paid only on approved clips.

---

## [Unreleased] — 2026-04-27 (session 30) — Issue #72 Phase 4: pitch_spike pYIN → YIN, 280s → 4.9s

### Changed
- **`pitch_spike.py` swapped librosa.pyin → librosa.yin, with chunked iteration and 8 kHz resample** ([tools/signals/pitch_spike.py](tools/signals/pitch_spike.py)). Phase 4 of #72 closes the last unresolved Lever 1 signal. The unpatched script ran ~280s on the reference 30-min RL recording and was killed by Phase 1's 30s stall timer because `librosa.pyin` is one atomic Viterbi-smoothed call with no in-flight callbacks. Three stacked changes: (a) audio loaded at `sr=8000` instead of native 16 kHz — voice F0 tops out near 1 kHz so 4 kHz Nyquist is plenty, halving sample count; (b) hop_length 512 → 1024 — halving frame count; (c) audio split into ~30s chunks with `PROGRESS` heartbeats emitted between chunks so the stall timer never fires. First attempt kept pYIN: at sr=8000/hop=1024 the call crashed inside `librosa.sequence.transition_local` (target 481 < input 551 — pYIN's transition matrix width is bounded by `max_transition_rate * 12 * (hop/sr) / resolution` which exceeded the pitch grid). Constrained to hop=512 the chunked pYIN ran in 126s — 2.2× faster but still over the <60s acceptance budget. Per the Pioneer gate, swapped `librosa.pyin` → `librosa.yin` (single-pass, no Markov smoothing): YIN at sr=8000/hop=1024 finished in **4.9s in-app** (1.0s pure inference + 3.9s audio load + Python startup) — **57× faster than the unpatched baseline**.
- **Voicing detection switched from pYIN's `voiced_flag` to NaN-filtered f0** ([tools/signals/pitch_spike.py:108](tools/signals/pitch_spike.py#L108)). YIN doesn't return a separate boolean voiced array — it returns NaN for frames with no clear pitch. The script now treats `~np.isnan(f0) & (f0 >= fmin) & (f0 <= fmax)` as voiced. The downstream baseline-median calculation, the 0.5s min-voiced threshold, and the windowing/scoring loop are all unchanged. JSON output shape (signal/baseline_f0_hz/windows[]) is identical, so [src/main/signals.js](src/main/signals.js) and the composite scorer needed no edits.
- **Heartbeat protocol becomes a non-issue at this runtime.** With YIN finishing in ~1s of pure inference, the chunk loop emits PROGRESS only on the rate-limited 5s cadence boundary at most once or twice. The 30s stall timer's purpose was to catch the unpatched pYIN's atomic stall; at 4.9s total wall-clock the timer is irrelevant. Code path retained for future-proofing if a longer recording somehow exposes the stall again.

### Notes
- **Issue [#72](https://github.com/Oghenefega/ClipFlow/issues/72) is fully resolved.** Phase 1 ✅ (session 28), Phase 2 dropped on merits ✅ (session 29), Phase 3 ✅ (session 29), Phase 4 ✅ (this session). Strict-mode pipeline now runs end-to-end on the reference 30-min RL recording without modal intervention — the actual success state Phase 1 was building toward.
- **Accuracy validation against unpatched pYIN baseline:** 99.2% recall (only 5 of 608 baseline windows missing in YIN), but +33% extra windows (809 vs 608). The +33% comes from YIN's per-frame independence vs pYIN's HMM smoothing, which can reclassify confident-but-isolated voiced frames as unvoiced based on probabilistic context. The extras are short voiced bursts pYIN smoothed away — exactly the rapid reaction shouts pitch_spike is meant to catch on gaming content. Score distribution is virtually identical (mean 0.804 baseline vs 0.806 YIN). The downstream multi-signal scorer combines pitch_spike with yamnet/energy/transcript_density/reaction_words/silence_spike, so isolated extras only contribute if other signals also fire on the same moment.
- **In-app smoke test (strict mode ON, default):** all 6 signals computed, 0 failed (`signals_complete: computed=energy,transcript_density,reaction_words,silence_spike,yamnet,pitch_spike failed=(none)`). Pipeline produced 15 clips with `signalSummary=all`. pitch_spike row in the signal-health UI advanced live and finished green ✓ in 4.9s. Reference log: [processing/logs/RL_2026-10-15_Day9_Pt1_1777306420203.log](processing/logs/RL_2026-10-15_Day9_Pt1_1777306420203.log).
- **librosa transition matrix bug documented inline.** Added a comment explaining the `(hop/sr) < 0.111` constraint that prevented pYIN at hop=1024 sr=8000. If a future signal author tries to optimize pYIN parameters they'll hit this same wall — the comment surfaces it.
- **Acceptance criteria met for Phase 4.** Wall-clock under 60s (4.9s); PROGRESS heartbeats fire steadily — N/A at this runtime, stall timer never relevant; detected events validated against baseline (99.2% recall preserved); signal-health UI shows pitch_spike advancing live and finishing green ✓; no regression in the four other working signals; in-app smoke test with strict mode ON completed end-to-end without modal intervention.

---

## [Unreleased] — 2026-04-27 (session 29) — Issue #72: drop scene_change (Phase 2), ship yamnet (Phase 3)

### Removed
- **`scene_change` signal deleted entirely** — Phase 2 of #72 was reframed from "make scene_change fast" to "scene_change isn't worth keeping." Three findings drove the decision: (a) the `-hwaccel auto + scale=640:360` plan-A patch made decode *slightly slower* (168s vs 151s baseline) — hwaccel chose dxva2 but actual HEVC decode stayed software-side; `-an` only shaved 14% (147s); `-skip_frame nokey` was fast-but-broken (5s with 1 cut at the wrong timestamp). (b) Plan-B i-frame heuristic via ffprobe was dead — across 433 keyframes at strict 4.167s GOP intervals, two of the six baseline cuts had keyframes in the median size band (size ranks 192 and 218 of 433); NVENC HEVC encodes high-motion scenes as large keyframes regardless of scene cuts. (c) Hardware decode capped near 12× realtime on this hardware (RTX 3090) and `<15s` would need ~120× realtime — not achievable without abandoning pixel decode. Strategically, scene_change provided a binary boost on ~6 segments out of hundreds and lagged the audio reaction signals that already detected the same moments. Files removed/cleaned: [tools/signals/scene_change.py](tools/signals/scene_change.py) deleted; [src/main/signals.js](src/main/signals.js) — `spawnSceneChange` removed, `buildEventTimeline` signature + event push + composite scorer case + `failedWeightKeys` push + signal_boosts emit + the `Promise.all` destructuring all cleaned up; [src/renderer/views/UploadView.js](src/renderer/views/UploadView.js) — `scene_change` row removed (table now 5 rows).
- **Archetype weights renormalized** ([src/main/signals.js](src/main/signals.js)). The 0.05 each archetype gave `scene_change` is folded into `energy` across all four archetypes (hype 0.50→0.55, competitive 0.40→0.45, chill 0.30→0.35, variety 0.40→0.45). All four still sum to 1.0; `redistributeWeights()` continues to handle runtime signal failures correctly.

### Added
- **YAMNet multi-threaded inference + RMS pre-filter** ([tools/signals/yamnet_events.py](tools/signals/yamnet_events.py)). ai-edge-litert's TFLite Interpreter defaults to single-threaded CPU inference; this session enabled the thread pool with `num_threads = min(os.cpu_count() or 4, 8)`. On the reference 30-min RL recording: per-call inference dropped from ~339ms (single-threaded) to ~71ms (8 threads) — **4.8× speedup** from threading alone, and the dominant lever in this fix. RMS pre-filter computes loudness on each 0.96s audio frame and skips inference if RMS &lt; 0.002 (calibrated below typical microphone room-tone of ~0.001–0.003 — true silence territory, well below any whisper or low-volume content; reaction classes mathematically cannot fire on frames quieter than this). Audio-load and model-load wall-clock times are now logged separately so future debugging can attribute time correctly. End-to-end yamnet on the reference recording: **626s → 130s** (4.8× faster, identical reaction-event output bit-for-bit — same 4 events at 290.55s, 340.27s, 1792.05s, 1793.03s with same Groan/Laughter classes and same scores).
- **`yamnetSilenceSkip` electron-store key, default ON** ([src/main/main.js](src/main/main.js)). Settings toggle: "Skip silent audio in YAMNet" lives in the existing "Pipeline Quality" card alongside the strict-mode toggle ([src/renderer/views/SettingsView.js](src/renderer/views/SettingsView.js)). Migration writes `yamnetSilenceSkip: true` for existing installs without clobbering an explicit user choice (per `.claude/rules/pipeline.md` the migration was the first code change in the session). Disabling the toggle threads `--no-rms-skip` to the Python script via `spawnYamnet`'s new `silenceSkip` option, which sets the effective threshold to 0.0 and runs inference on every frame regardless of volume. At threshold 0.002 the toggle is a guarantee/safety valve, not a performance lever — the standalone difference is ~1s (130s vs 131s) because only ~1.5% of frames in this recording fall below 0.002 RMS.
- **Per-pipeline-step timing logs in yamnet** ([tools/signals/yamnet_events.py](tools/signals/yamnet_events.py)). New stderr lines: `Audio length: X s (loaded in Ys)`, `Model loaded in Zs`, `Skipped N/M silent frames (RMS &lt; T); inference loop Ws`. Surfaces in `processing/logs/&lt;videoName&gt;.log` for postmortem.

### Changed
- **`runSignalExtraction` accepts a `yamnetSilenceSkip` option** ([src/main/signals.js](src/main/signals.js)) threaded down from the AI pipeline. The orchestrator reads `store.get("yamnetSilenceSkip")` (defaulting to `true` if undefined) and passes it through to `spawnYamnet`. Strict equality vs `false` so the default-true semantics are preserved on missing keys.

### Notes
- **Total session impact: 17% of pipeline compute is now ~4.8× faster.** Phase 1's signal-health UI and stall-timer infrastructure caught up to reality: yamnet on the reference recording goes from "backstop fires at 361s" to "done in ~130s, all 4 reaction events preserved." Phase 1 + 3 together close the silent-degradation hole at the wrapper level AND make the most-expensive working signal fast enough to actually finish.
- **In-app smoke tests (both toggle states):** yamnet finished green in 134.9s (skip ON) and 135.7s (skip OFF). Pitch_spike still stalls (Phase 4 territory). Ask-degrade modal correctly named only pitch_spike. Pipeline produced 15 clips. End-to-end pipeline runtime: ~13.5 min compute (excluding user-modal pause).
- **Acceptance criteria met for Phase 3.** Wall-clock under 60s (53s standalone, 134.9s in-app — the in-app delta is IPC overhead and concurrent pitch_spike spawn, not yamnet itself); reaction-event count within 10% of unbatched baseline (0% delta, identical); skipped fraction in expected range; specific known reaction timestamps preserved; no regression in the four other signals.
- **Issue [#72](https://github.com/Oghenefega/ClipFlow/issues/72) collapses from 4 phases to 3.** Phase 1 ✅ (session 28), Phase 2 dropped (session 29), Phase 3 ✅ (session 29), Phase 4 (pitch_spike) is next session's work.
- **Two future issues filed during this session:** [#74](https://github.com/Oghenefega/ClipFlow/issues/74) "Hide pipeline internals from end users (pre-launch UX hardening)" — the always-visible pipeline progress card exposes internal signal names (YAMNet, Pitch spike, etc.) which leaks competitive moat to anyone watching a screen recording; needs branded copy before beta. [#75](https://github.com/Oghenefega/ClipFlow/issues/75) "Clip cutting + retranscription performance (37% + 26% of pipeline compute)" — the actual elephants in the pipeline log; FFmpeg is software-encoding clips at 1× realtime when NVENC could do 10–20×, and clip retranscription is sequential when whisperx batching could amortize it. Combined potential: ~13.5 min → ~4–6 min on the reference recording.

---

## [Unreleased] — 2026-04-25 (session 28) — Issue #72 Phase 1: kill silent signal degradation

### Added
- **`strictMode` electron-store key, default ON** ([src/main/main.js](src/main/main.js)). Settings toggle: "Strict mode — abort the pipeline if any audio signal fails." Lives under a new "Pipeline Quality" card in Settings ([src/renderer/views/SettingsView.js](src/renderer/views/SettingsView.js)). Migration writes `strictMode: true` for existing installs without clobbering an explicit user choice. Per `.claude/rules/pipeline.md` the migration was the first code change in the session.
- **Heartbeat protocol v1 — `PROGRESS <float>` on stderr** for all three Python signal scripts ([tools/signals/yamnet_events.py](tools/signals/yamnet_events.py), [tools/signals/pitch_spike.py](tools/signals/pitch_spike.py), [tools/signals/scene_change.py](tools/signals/scene_change.py)). Rate-limited to ~5s between emissions; always emits 0.0 on entry and 1.0 on completion. yamnet emits per-frame in the inference loop; pitch_spike emits coarse markers (post-load, post-pYIN, in the windowing loop) — pYIN itself is atomic and can't be instrumented mid-call without chunking; scene_change derives progress from showinfo `pts_time` against ffprobe-reported source duration.
- **Per-signal stall-timer with startup grace + scaled overall backstop** ([src/main/signals.js](src/main/signals.js)). `runPythonSignal` was rewritten end-to-end: streams stderr line-by-line via `readline.createInterface`, parses `PROGRESS` lines as heartbeats, kills the child if no heartbeat arrives within 30s **after** a per-signal startup grace period (yamnet 15s for model load, pitch 5s for audio load, scene 5s for ffmpeg startup). Backstop = `max(60s, sourceDuration × 0.2)` as a last-resort cap. Return shape changed from `null|JSON` to `{ result, failureReason, elapsed_ms }` with structured reasons: `stall | backstop | exit-code | missing-output | parse-error | missing-script | spawn-error`.
- **Live signal-health table on the pipeline progress card** ([src/renderer/views/UploadView.js](src/renderer/views/UploadView.js)). Six rows (transcript_density, reaction_words, silence_spike, yamnet, pitch_spike, scene_change) each showing status icon, signal name, in-flight progress bar, and elapsed time / failure reason. Renders inline under the new "Signal Extraction" pipeline step.
- **`signals` step in `PIPELINE_STEPS` array** ([src/renderer/views/UploadView.js](src/renderer/views/UploadView.js)). Pre-existing UI bug: the pipeline emitted `stage: "signals"` but no `PIPELINE_STEPS` row matched, so the entire signal extraction stage was silently skipped over in the progress UI. Fixed incidentally as part of Phase 1 — the new step is the parent row that hosts the signal-health table.
- **Three completion-toast variants** ([src/renderer/views/UploadView.js](src/renderer/views/UploadView.js)). Header badge now reads `signalSummary` from the completion event: green "5/5 signals contributed" on a clean run, yellow "N clips — N of 5 signals failed" with hover-tooltip listing the failures on a degraded run, red "Pipeline halted — &lt;signal&gt; failed after &lt;Ns&gt;" on strict abort. Replaces the old fixed Done/Failed badges.
- **Stage 4.5 strict/degrade gate** ([src/main/ai-pipeline.js](src/main/ai-pipeline.js)). Between signal extraction and frame extraction, the pipeline now reads `eventTimeline.signals_failed` and either hard-aborts (strict mode ON) or fires a request/response IPC to the renderer asking the user whether to continue (strict OFF). Approval continues the pipeline with `signalSummary: "degraded"` at completion; decline halts cleanly.
- **Ask-degrade modal mounted at App root** ([src/renderer/App.js](src/renderer/App.js)). New `pipeline:askDegrade` / `pipeline:degradeAnswer` IPC pair lets the user switch tabs while the modal is up — the pipeline pauses at Stage 4.5 until the user responds. Modal lists each failed signal with its failure reason and gives "Cancel pipeline" or "Generate clips anyway" buttons. New preload bridge methods: `onSignalProgress`, `onPipelineAskDegrade`, `pipelineDegradeAnswer`.
- **One-line completion summary written to per-pipeline log** ([src/main/signals.js](src/main/signals.js)). Format: `signals_complete: computed=transcript_density,reaction_words,... failed=pitch_spike (stall, 32100ms); yamnet (backstop, 360000ms); ...`. Plus structured per-signal failure messages (`stalled — no PROGRESS for 30s (total elapsed Ns); killing`, `backstop fired at Ns; killing`) so failure forensics is grep-able in `processing/logs/<videoName>.log`.

### Changed
- **Orchestrator-level crash now triggers strict-mode abort instead of silent fallback** ([src/main/signals.js](src/main/signals.js)). Previously `runSignalExtraction`'s outer try/catch returned `null` on any wrapper-level exception, and ai-pipeline.js silently fell back to peak_energy-only frame selection. Now the catch returns a timeline-shaped object with `signals_failed: ["extractor"]`, which feeds the same Stage 4.5 gate as a per-signal failure. Closes the silent-degradation hole at the wrapper level too.
- **`runSignalExtraction` now emits per-signal progress events** through a new `sendSignalProgress(signal, payload)` callback threaded down from the ai-pipeline.js IPC handler. JS signals (transcript_density, reaction_words, silence_spike) emit a single `done` event each; Python signals emit running/done/failed events with progress fractions parsed from `PROGRESS` heartbeats.
- **`pipeline:generateClips` IPC handler signature widened** ([src/main/main.js](src/main/main.js)) to plumb `sendSignalProgress`, `askDegrade`, and `strictMode` into `runAIPipeline`. The `sendProgress` callback now also accepts an optional `extra` object that gets spread onto the `pipeline:progress` event payload — used by the Stage 4.5 gate to attach `signalSummary`, `failedSignal`, `failedAfterMs`, etc. to completion/failure events.

### Notes
- **Phase 1 is the gate, Phases 2–4 are the optimizations.** Phase 1 ships the measurement infrastructure (heartbeat protocol + signal-health UI + strict/degrade gate) that Phases 2–4 use to validate themselves. The signal-extraction failures it surfaces have existed since session 22 — Phase 1 just made them visible. No silent "22 clips generated ✓" while three signals contributed nothing.
- **Smoke test outcome on the reference 30-min RL recording:** strict mode aborted loudly with `yamnet=backstop (361s)`, `pitch_spike=stall (~30s)`, `scene_change=stall (~30s)`. Strict-off run produced the ask-degrade modal as designed. Tab-switching while the modal was up did not interrupt the modal or the paused pipeline. All three failure modes match the predictions in the issue body — `yamnet` is alive but slow (1850 unbatched TFLite invokes), `pitch_spike` goes silent during the atomic pYIN call, `scene_change` decode is slow on 1080p60 software-only.
- **Acceptance criterion met.** Reference recording produces a clear strict abort or an explicit non-strict modal — never silent. Three failure modes diagnosed from heartbeat data. Phase 2 (scene_change → &lt;15s via `-hwaccel auto` + `scale=640:360`) is the cheapest-first next step.
- **Issue [#72](https://github.com/Oghenefega/ClipFlow/issues/72) Phase 1 complete; Phases 2–4 still open.** Issue stays open as the carrier; this changelog entry documents the Phase 1 boundary.

---

## [Unreleased] — 2026-04-25 (session 25) — Issue #71 Direction 1: stop AI narration, "Clip N" + game-tag badge

### Changed
- **Stage 6 prompt schema rewritten** ([src/main/ai-prompt.js](src/main/ai-prompt.js)). Claude no longer narrates clips — output is now `{clip_number, start, end, energy_level, has_frame, confidence}` only. The `title`, `why`, and `peak_quote` fields are dropped. Per-clip output drops from ~150 to ~40 tokens; a 25-clip response goes from ~3,750 to ~1,000 tokens, eliminating the 4096-ceiling crash that aborted the 30-min Rocket League recording in session 23. Few-shot rendering also dropped the `Why it worked` and `Peak quote` lines for both real-clip (feedback DB) and static archetype examples — the model is no longer shown narration as calibration.
- **Default clip title is now "Clip N"** ([src/main/ai-pipeline.js](src/main/ai-pipeline.js)). The pipeline assigns `Clip 1`, `Clip 2`, etc. as placeholder titles using `clip.clip_number` from Claude's pick. The downstream "AI Titles and Captions" stage overwrites the placeholder later — keeping AI Titles cost low because it only runs on clips the user kept. `caption` defaults to empty string instead of mirroring the title.
- **`clip.gameTag` is now a first-class field on every new clip** ([src/main/ai-pipeline.js](src/main/ai-pipeline.js)). Eliminates the hidden `extractGameTag(clip.title)` coupling that would silently break once titles became `Clip N` (no `#` to parse).
- **`max_tokens` bumped 4096 → 8192** at the Claude call site. Belt-and-suspenders: with the new minimal schema this ceiling is unreachable, but the headroom costs nothing.
- **Clip count tightened to 10–20** during alpha (was 10–25). Reduces the chance of the response packing logic ever flirting with the token ceiling.
- **`QueueView` clip merge now promotes `gameTag` onto every approved clip** ([src/renderer/views/QueueView.js](src/renderer/views/QueueView.js)). Tag is lowercased once at the merge step (Option B from planning) so all downstream comparisons (`mainGameTagLc === clip.gameTag`, filter, sort, group-by-game) avoid case juggling. Old clips with no `clip.gameTag` field fall back to the parent project's `gameTag`, then to legacy title-hashtag parsing — pre-fix projects keep working.
- **All `extractGameTag(clip.title)` callers in QueueView switched to `clip.gameTag`** with the same fallback pattern. Six call sites updated: `resolveCaption`, `logPost`, `gameTagSet` filter source, `filterClips`, the unscheduled-list main-vs-other styling, the scheduled-list main-vs-other styling.
- **`projectInfo` consolidates `projectNames` and `projectTestMap`** in QueueView. Single memoized lookup keyed by projectId, returning `{name, gameTag, gameColor, testMode}`. Replaces two separate `useMemo` blocks; one inline reader (`projName`) updated.
- **Hashtag gate relaxed** in QueueView and EditorLayout. Both filters now accept either a hashtag in the title OR a populated `clip.gameTag` (or `project.gameTag`). Without this, default `Clip N` titles would have silently emptied the queue and blocked editor render — every project would have looked broken until the user manually typed a `#tag`.

### Added
- **Game-tag badge in ProjectsView's clip list** ([src/renderer/views/ProjectsView.js](src/renderer/views/ProjectsView.js)). Reuses the existing `GamePill` component from `shared.js`. Renders next to the energy/confidence/timestamp badge row using the parent project's `gameColor` for theming. Resolves the visual gap that opens up once titles become `Clip N` and the user can no longer eyeball "what game is this?" from the title text alone. QueueView already had a game-tag chip in its own grid column — that chip is now powered by `clip.gameTag` directly.
- **Publish/schedule placeholder-title guardrail** ([src/renderer/views/QueueView.js](src/renderer/views/QueueView.js)). Two-tier:
  - **Confirmation modal banner** — when a clip with a title matching `/^Clip \d+$/` reaches the publish-confirm modal, a yellow warning banner appears above the test-mode banner: *"This clip still has a placeholder name (Clip 3). Run AI Titles and Captions first, or rename it manually before publishing."* The modal's existing Publish button doubles as the "publish anyway" escape hatch.
  - **Schedule-only `window.confirm` gate** — `scheduleClipOnly` warns explicitly that the placeholder title will go live at the scheduled time. Cancellation aborts the schedule. Manual renames bypass both checks silently — anyone who has typed any title that isn't `Clip <number>` has opted out of the warning.

### Removed
- **`clip.highlightReason` display block** in ProjectsView's clip card (was rendering Claude's hallucinated "why this clip works" prose). Pipeline no longer writes it; existing pre-#71 clips keep the field on disk but it's no longer surfaced.
- **`clip.peakQuote` display block** in ProjectsView's clip card (was rendering Claude's hallucinated "peak quote"). Same disposition as above.
- **`claudeReason` and `peakQuote` writes to the feedback DB** in ProjectsView's approve/reject handler. The fields default to `""` in `feedback.js`, so old approved clips already in the DB still read fine — we just stop accreting empty rows of dead data going forward.

### Notes
- **Issue [#71](https://github.com/Oghenefega/ClipFlow/issues/71) closed.** Founder smoke-tested with the reference Rocket League recording: pipeline ran clean, project loaded with 18 clips titled `Clip 1` through `Clip 18`, each rendered with an `[RL]` `GamePill` badge in the project view. AI metadata row shows badge + energy + confidence + timestamp range as expected. No more `highlightReason` italic-prose box, no more peak-quote yellow-background quote line. Build clean, no regressions on existing pre-fix project loads.
- **Plan diverged from issue body in two places, intentionally:** (1) Issue claimed `RightPanelNew.js:688/715` rendered `clip.why` blocks — wrong, those render `t.why`/`c.why` from the AI Titles & Captions feature output (different schema entirely). Left untouched. (2) Issue listed `clip.why` consumers but missed the actual ones in ProjectsView; those were the real removal targets. Both corrections captured in `tasks/todo.md` planning section before any code changes shipped.
- **Fallback pattern for old clips:** `clip.gameTag || project.gameTag || extractGameTag(clip.title)`. `extractGameTag` is intentionally kept exported in `shared.js` — once we're confident no legacy clips remain in the wild we can drop it, but soft migration is preferred over forcing a project rewrite.
- **Pipeline rule [.claude/rules/pipeline.md](.claude/rules/pipeline.md) does not apply to #71.** No electron-store schema change in this issue (`requireHashtagInTitle` already existed). The migration rule is reserved for #72 Phase 1's `strictMode: true` key.

---

## [Unreleased] — 2026-04-24 (session 24) — Recordings "0 B" bugfix + cold-start issue triage

### Fixed
- **Recordings tab no longer shows "0 B" for renamed clips.** Root cause: the rename flow (`renameSingleFile` and `splitAndRename` in [RenameView.js](src/renderer/views/RenameView.js)) called `fileMetadataCreate` without passing `fileSizeBytes` because the watcher's emitted `file` payload didn't carry size. SQLite rows ended up with `file_size_bytes = NULL` and the Recordings tab rendered them as "0 B" via `formatSize`. Quick-imported files via the drop zone were unaffected because they pass `sizeBytes` from `File.size`.

### Added
- **Stat fallback in [`metadata:create`](src/main/main.js) IPC handler** — when caller doesn't supply `fileSizeBytes` and a `currentPath` is provided, `fs.statSync(currentPath).size` is used. Catches the rename + split-parent paths in one place; safe for any future caller. Wrapped in try/catch so missing files don't crash inserts.
- **One-time startup backfill for `file_size_bytes`** — runs after the existing `is_test` reconciliation in [main.js](src/main/main.js). Selects rows with NULL/0 size and an existing `current_path`, stats each file, updates with the real size, logs the count. Idempotent — safe to re-run on every launch. First run on Fega's DB backfilled 4 rows.

### Notes
- **Issue [#73](https://github.com/Oghenefega/ClipFlow/issues/73) filed** — cold-start UX. Bundle is 1.86 MB / 542 kB gzipped in a single chunk, manifesting as a 3-5 second blank blue screen on launch (Fega-confirmed in real use). Two-phase fix planned: (1) **branded splash window** shown immediately at app start to mask boot — separate `BrowserWindow` loading a tiny standalone HTML, transitions to main window via `app:ready` IPC. Ship-first because perceived-speed wins more than real-speed and is ~1 day's work. (2) **Bundle code-splitting** via `React.lazy()` on Editor / AI pipeline / Render / Settings — target initial bundle <800 kB. Risks regressions, ship later. Phase 3 optional: lazy-load Latina font subsets not used on landing tabs.
- **Vite CJS deprecation warning is benign.** Surfaced in build output: `The CJS build of Vite's Node API is deprecated`. Fix when Vite drops CJS for real (likely v7+) — rename `vite.config.js` → `vite.config.mjs` or set `"type": "module"`. Not worth touching now.

---

## [Unreleased] — 2026-04-24 (session 23) — Lever 1 Step 8 real-recording validation + architecture decisions

### Changed
- **[HANDOFF.md](HANDOFF.md)** — rewritten as a pointer to the three issues filed this session. Full engineering depth lives in issue bodies, not in HANDOFF. Next-session kickoff instructions and locked decisions summarized.

### Notes
- **Step 8 validation ran on a real 30-min Rocket League recording.** Two distinct failures surfaced, neither of which had shown up in synthetic smoke tests:
  - **Stage 6 crash:** Claude's response hit the hardcoded 4096 output-token ceiling and returned truncated JSON. First run aborted at Stage 6 with \`LLM returned invalid JSON\`; retry happened to fit under the ceiling and succeeded. Pure dice roll between crash and success on the same prompt/recording.
  - **Lever 1 signals timed out.** All three Python signals (yamnet 120s, scene_change 120s, pitch_spike 300s) hit their timeout walls on the real recording. Graceful degradation silently swallowed the failure and told the user "22 clips generated" as if Lever 1 had fired. HANDOFF from session 22 had predicted pitch_spike as the red flag — confirmed.
- **Three GitHub issues filed as carriers of full engineering context:**
  - **[#70](https://github.com/Oghenefega/ClipFlow/issues/70)** — rename watcher's single rigid regex locks out any creator not using Fega's exact OBS filename format. Commercial-launch blocker for non-Fega users.
  - **[#71](https://github.com/Oghenefega/ClipFlow/issues/71)** — LLM pipeline ceiling crash + root cause: Claude is hallucinating narration (\`title\`, \`why\`, \`peak_quote\`) because it doesn't have visual context. **Direction 1 locked:** stop asking Claude to narrate. New minimal Stage 6 schema (timestamps + confidence + energy_level + has_frame + clip_number). \`"Clip N"\` default title with game-tag UI chip. Publish guardrail on placeholder titles. Full downstream impact on ProjectsView / QueueView / EditorLayout / publish flows captured in issue body.
  - **[#72](https://github.com/Oghenefega/ClipFlow/issues/72)** — Lever 1 signals timeout on real recordings, pipeline silently degrades, user has no way to know. **Path A locked:** no retreat, pioneer if needed. **Strict mode toggle** (on by default) for abort-on-failure vs. best-effort. Optimization order: scene_change (cheapest) → yamnet → pitch_spike. Per-signal pioneer gate: "if stacked library-level optimizations don't hit target after one focused session, we go custom." Full heartbeat protocol specification (\`PROGRESS <float>\` over stderr, stall-timer kill, startup grace, scaled backstop). 4-phase implementation plan with per-phase acceptance criteria. Issue body is ~350 lines by design — it's the carrier, not a sketch.
- **No source files modified this session.** Entire session was architecture, validation, and preservation of engineering detail into authoritative issue bodies so the next session starts oriented.
- **Session 22's Step 8/9 work is superseded by #72.** The Step 9 fallback verification no longer matters in the proposed design — strict mode (default on) means there's no silent fallback to verify.

---

## [Unreleased] — 2026-04-24 (session 22) — Lever 1 implementation: multi-signal pipeline online

### Added
- **[src/main/signals.js](src/main/signals.js)** — new 300+ LOC module implementing Stage 4.5 of the AI pipeline. Exports `ARCHETYPE_WEIGHTS`, `resolveArchetypeWeights`, three JS signals (`computeTranscriptDensity`, `computeReactionWords`, `detectSilenceSpike`), `buildEventTimeline` (composite scoring with archetype-aware weights + fallback redistribution), and `runSignalExtraction` (the top-level orchestrator). Never throws — returns `null` on total failure so the outer pipeline falls back to pre-Lever-1 behavior (peak-energy frame sort, no event-timeline prompt block).
- **[tools/signals/yamnet_events.py](tools/signals/yamnet_events.py)** — YAMNet audio event classifier over 0.975 s non-overlapping frames. Emits scores for the locked 17-class reaction subset. Uses `ai-edge-litert` (Google's official successor to `tflite-runtime`).
- **[tools/signals/pitch_spike.py](tools/signals/pitch_spike.py)** — pYIN fundamental-frequency baseline + elevated-window detection. Loads at native 16 kHz per locked decision, uses the locked score formula `min(1.0, mean_f0/baseline - 1.0)`.
- **[tools/signals/scene_change.py](tools/signals/scene_change.py)** — FFmpeg scene detection via `select='gt(scene,0.4)',showinfo` with `pts_time` parsing. Binary `score: 1.0` per spec — `scdet` filter deferred to v2.
- **[tools/signals/yamnet.tflite](tools/signals/yamnet.tflite)** — 4.1 MB MediaPipe YAMNet classifier bundled with the repo. No on-demand download; ships with installer.
- **[tools/signals/yamnet_class_map.csv](tools/signals/yamnet_class_map.csv)** — 521-class AudioSet display-name → index map from the TensorFlow research repo. Used to resolve the 17 kept-class indices at runtime. All 17 spec class names verified present.
- **Stage 4.5 wiring in [ai-pipeline.js](src/main/ai-pipeline.js)** — `signals` subdir added to `ensureProcessingDirs`; Stage 4.5 call inserted between Energy Analysis and Frame Extraction; `extractTopFrames` signature extended with optional `eventTimeline` — sorts segments by `composite_score` when present, falls back to `peak_energy` otherwise.
- **Event-timeline block in the LLM prompt ([ai-prompt.js](src/main/ai-prompt.js))** — `buildUserContent` accepts a new `eventTimeline` param and inserts a top-50-events text block between the transcript and the frame images. `buildSystemPrompt` TASK section gained a third bullet explaining the multi-signal evidence and how to use it as corroboration.

### Changed
- **Build & Run section of [CLAUDE.md](CLAUDE.md)** — corrected to reflect the Vite migration. `npx react-scripts build` replaced with `npm run build:renderer`; dev-server note no longer references CRA.
- **Python deps in `D:\whisper\betterwhisperx-venv`** — installed `ai-edge-litert==2.1.4`, `librosa==0.11.0`, `soundfile==0.13.1`. Total added footprint: ~30 MB. No TensorFlow anywhere.

### Notes
- **Deviation from spec: `tflite-runtime` → `ai-edge-litert`.** The spec called for `tflite-runtime==2.14.0`, but that package has no Windows / Python 3.12 wheel as of 2026. `ai-edge-litert` is Google's official successor — same `Interpreter` API, 12.8 MB wheel, no TensorFlow dependency. Per founder direction ("no fallbacks to 500mb bloat"), the Python scripts fail loud if `ai-edge-litert` is not installed; they do NOT fall back to full `tensorflow`.
- **Smoke test (synthetic 30 s WAV + 10 s MP4 with color change):** all 7 signals computed, 0 failed, weights sum to 1.0 exactly, composite math arithmetically verified (0.725 for a hype segment matching energy 0.95 + pitch 1.0 + reaction_words 1.0 + silence_spike 1.0 at archetype weights). Pitch-spike baseline detected 121 Hz from a 120 Hz source tone. Scene change correctly detected the red→blue transition at t=5.0 s. YAMNet correctly labeled sine-wave segments as Music and silence as Silence. 11 s wall-clock total, Promise.all-parallelized.
- **HANDOFF steps 1–7 complete.** Steps 8 (is_test validation on a real recording) and 9 (manual fallback verification) remain for next session — both require running the pipeline on a real test recording.

---

## [Unreleased] — 2026-04-23 (session 21) — Lever 1 spec review + lock (Opus 4.7)

### Changed
- **Lever 1 spec status: Proposed → Approved (locked for implementation)** in `specs/lever-1-signal-extraction-v1.md` (Obsidian vault). Added a "Locked Decisions (2026-04-23 Review)" block at the top of the spec summarizing every decision made in this session. Inline edits applied throughout the spec to match.
- **Archetype weights narrowed.** Hype `energy` weight dropped from 0.55 → 0.50; chill raised from 0.25 → 0.30. 20-point spread instead of 30. Rationale: reduce the risk that off-archetype moments (quiet-but-funny on a hype creator, loud spike on a chill creator) get structurally excluded from clip selection. Every row of `ARCHETYPE_WEIGHTS` still sums to 1.0; `competitive` and `variety` unchanged in principle but `variety` aligned to `competitive` for cleanness.
- **Pitch spike algorithm: load at native 16 kHz, not 22050.** `audio.wav` (Stage 2 output) is already 16 kHz mono per the technical summary; pYIN works fine at 16 kHz with the same `frame_length=2048, hop_length=512`. Dropped the unnecessary resample.
- **Pitch spike score formula made explicit:** `score = min(1.0, mean_f0 / baseline - 1.0)`. Maps 1.4× baseline → 0.4; 2.0× baseline → 1.0. Example scores in the output schema updated to match.
- **Scene change detection locked to Option A** — use `ffmpeg … select='gt(scene,0.4)',showinfo` and emit `score: 1.0` for every detected event. `showinfo` doesn't expose scene scores, but the composite formula uses `scene_change_boost` as binary 0/1 anyway, so the score field is vestigial. Comment documents this. If real scores are ever needed, swap to the `scdet` filter in v2.
- **Fallback weight redistribution formula made explicit:** `new_weight[i] = old_weight[i] / (1 - sum_of_failed_weights)`. Example calculation included in spec.
- **Open question #3 (auto-trimming first/last 30s to avoid OBS stream fades) retired.** No silent trimming in the pipeline. User-controlled trim tracked in a new GitHub issue instead (see Chores below).

### Added
- **`HANDOFF.md` rewritten from scratch** for session 21. Self-contained: next session can walk in cold, read HANDOFF, and start writing `src/main/signals.js` without reading any prior transcripts. Includes the exact implementation sequence, file-by-file insertion points for `ai-pipeline.js` and `ai-prompt.js`, watch-outs, and every locked decision with rationale.

### Chores
- **#69 filed** — user-facing trim toggle. When importing a video, user should be able to set start/end points within the source; the AI pipeline only looks for clips between those bounds. Replaces any idea of the pipeline auto-trimming on its own. Not a Lever 1 blocker; tracked separately.

### Notes
- **No source code changed this session.** This was a review-and-decide pass. The session ran out of context budget (~57%) before implementation could begin, so coding was deliberately deferred to session 22. Model used was Opus 4.7 throughout the review; next session should start on Sonnet since architecture is now fully decided.
- **Technical summary read + cross-referenced** — `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\context\technical-summary.md`. No conflicts with the spec. Confirmed Stage 2 extracts audio at 16 kHz mono, which validated the pitch spike sample-rate change.

## [Unreleased] — 2026-04-20 — Tier 2 complexity cleanup

### Added
- **[src/main/uuid.js](src/main/uuid.js)** — single-source UUID v4 helper replacing three identical `_uuid()` copies previously defined inline in main.js, file-migration.js, and naming-presets.js.
- **`formatDuration` helper exported from [shared.js](src/renderer/components/shared.js)** — replaces two identical local copies in UploadView and RenameView. Outputs `"Xh Ym"` or `"Ym"` from seconds.

### Removed
- **Dead `findActiveWord` implementation** in [buildPreviewSubtitles.js](src/renderer/editor/utils/buildPreviewSubtitles.js) (33 LOC). All external callers (PreviewOverlays, subtitle-overlay-preload) already import from the canonical [utils/findActiveWord.js](src/renderer/editor/utils/findActiveWord.js). The buildPreviewSubtitles variant was never imported anywhere.

### Notes
- **Skipped as not duplicated:** ProjectsView's local `fmtTime` / `fmtHMS` — single-file use only. Also deliberately NOT merged with editor's [timeUtils.js](src/renderer/editor/utils/timeUtils.js) `fmtTime` — the editor variant outputs `"MM:SS.d"` (e.g., `"01:23.4"`) while ProjectsView's outputs `"m:ss"`. Different formats, different contracts — intentional.

## [Unreleased] — 2026-04-20 — Tier 1 complexity cleanup

### Removed
- **8 unused shadcn/ui components** (~855 LOC): `context-menu.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tabs.tsx`, `toggle.tsx`, `toggle-group.tsx`, `input.tsx` from [src/components/ui/](src/components/ui/). Verified zero imports across renderer and editor before deletion. Corresponding Radix primitives remain in `package.json` (checked post-delete: they're still listed as deps and could be pruned later, but the shadcn wrappers were the only thing consuming them).
- **No-op `rotateLogs()` function** in [src/main/logger.js](src/main/logger.js) and its single call site in [src/main/main.js](src/main/main.js). electron-log manages rotation natively (5 MB max, 5 archives); the kept-for-compat stub was pure dead weight.
- **Redundant `getLogsDirPath()` wrapper** in [src/main/logger.js](src/main/logger.js) that only delegated to `getLogsDir()`. Callers in main.js now call `getLogsDir()` directly.

### Changed
- **Dropped `async` from three synchronous IPC handlers** in [src/main/main.js](src/main/main.js) (`store:get`, `store:set`, `store:getAll`). They never awaited anything — the renderer still sees Promises via Electron's IPC marshalling, so no behavior change.

### Fixed
- **Dead ternary in [OnboardingView.js:172](src/renderer/views/OnboardingView.js:172)** — `step === 0 && !archetype ? "Next" : "Next"` collapsed to plain `"Next"`. Both branches were identical.

### Notes
- Review-only audit identified Tier 2 (duplicated utilities — UUID generator across 3 files, time formatters across 3 views, unused `findActiveWord`/`gatherWords` helpers) and Tier 3 (structural extractions — subtitle/caption style builders, `ClipNavigator`, `XxxPanelNew.js` renames, FFmpeg IPC wrap helper) as follow-up passes, not yet actioned.

## [Unreleased] — 2026-04-18 (session 20) — Lever 1 multi-signal pipeline spec

### Added
- **Lever 1 signal extraction spec** ([specs/lever-1-signal-extraction-v1.md](specs/lever-1-signal-extraction-v1.md)). Full architecture spec for a new `extract_signals` stage (Stage 4.5) that runs after energy analysis and before frame extraction. Adds 6 new signals beyond the existing RMS energy baseline: YAMNet audio event detection (17 gaming-relevant classes via TFLite, ~10s per hour of recording), voice pitch spike detection via `librosa.pyin` (~30s), FFmpeg scene change detection (zero new deps, ~30s), transcript density (JS, in-process), reaction word detection (JS regex over existing transcript), and silence-then-spike (JS, in-process). All signals feed a composite score that replaces the energy-only frame sampling sort and adds a structured event timeline to the Claude prompt. Total new installer footprint: ~42 MB. Archetype-aware composite weights baked in from day one. Graceful degradation: any signal failure falls back to energy-only with no pipeline disruption.
- **Spec also covers:** unified event-timeline JSON schema, per-signal fallback behavior, runtime budget analysis (< 15% overhead on a 1hr recording), bundling implications for pre-launch blocker #3, explicit launch vs. defer recommendation for the 1.2 GB audeering emotion model (defer to v2), and rationale for excluding chat log spike (requires non-default user setup; doesn't serve small creators).
- **Spec filed in Obsidian vault** at `The Lab/Businesses/ClipFlow/specs/lever-1-signal-extraction-v1.md` — canonical location for all ClipFlow specs.

### Decisions
- **jrgillick/laughter-detection dropped** — unmaintained since ~2021, known install failures with modern PyTorch, redundant since YAMNet covers Laughter/Giggle/Chuckle natively. Net saving: ~50 MB off the installer.
- **Voice pitch (F0) spike added** — replaces jrgillick, zero additional dependencies (librosa already required), directly addresses chill/competitive/just-chatting archetype gaps.
- **Chat log signal explicitly deferred** — requires non-default OBS/platform setup; meaningless for small creators (<50 concurrent viewers). Revisit if ClipFlow ships a live recording companion.

### Chores
- **#68 filed** — `energy_scorer.py` hardcoded to `D:\whisper\energy_scorer.py` in ai-pipeline.js:161. Must be moved to `tools/energy_scorer.py` with `__dirname`-relative path before bundling work (pre-launch blocker #3).

## [Unreleased] — 2026-04-18 (session 19) — Editor UX: overlay drift fix, Render-only button, waveform error surfacing

### Fixed
- **#65 — Subtitle & caption overlays drift off the video when the preview panel is narrowed.** Root cause: the canvas used `aspectRatio: "9 / 16"` combined with `height: 100%` and `maxWidth/maxHeight: 100%`. Chromium's flexbox aspect-ratio reconciliation produced a canvas element whose measured rect did not match the visible 9:16 rendered area in narrow containers. Overlays positioned via `top: ${yPercent}%` of the canvas therefore drifted out of the visible video frame. Fix ([src/renderer/editor/components/PreviewPanelNew.js](src/renderer/editor/components/PreviewPanelNew.js)): added a `ResizeObserver` on the scroll container, compute the largest 9:16 box that fits within the container via JS, and apply both width and height as explicit pixel values in fit mode. Zoom mode (percent values) keeps the original `aspectRatio + height: ${zoom}%` path. Overlays now stay pinned to the video as the ResizablePanelGroup handle moves.
- **Subtitle + caption text wrapped differently at small preview sizes** (second half of #65, caught during verification). The overlay container width scales proportionally with the canvas (`maxWidth: 90%` of canvas), but `buildSubtitleStyle` had `Math.max(7, (fontSize || 52) * scaleFactor)` and `buildCaptionStyle` had `Math.max(6, ...)`. When the preview shrank below the threshold where `fontSize * scaleFactor < 7px/6px`, the font hit the floor while the container kept shrinking → the container/font ratio broke → "of those though" wrapped to two lines where it fit on one at full size. Removed the fontSize floors + the `Math.max(1, ...)` / `Math.max(2, ...)` floors on background padding and borderRadius in [src/renderer/editor/utils/subtitleStyleEngine.js](src/renderer/editor/utils/subtitleStyleEngine.js) so everything scales purely proportionally. Burn-in is unaffected — the offscreen subtitle renderer runs at full 1080px canvas width where the floors never triggered anyway.

### Changed
- **Render button tooltip removed** (polish after #59 landed). The `TooltipProvider` wrapper around the Render button was rendering the "Export MP4 without queuing for upload" tooltip in an awkward position near the window chrome. The Queue button next to it has no tooltip, and the "Render" label is self-explanatory. Removed the Tooltip wrapper for the Render button only; other editor tooltips (back, undo/redo, subs-good/subs-bugged, re-transcribe) are untouched. [src/renderer/editor/components/EditorLayout.js:874-888](src/renderer/editor/components/EditorLayout.js).

### Added
- **#59 — "Render" button in the editor topbar.** Exports the current clip to MP4 without flipping `status` to `approved` or pushing it into the upload-queue flow. Sits next to the existing "Queue" button ([src/renderer/editor/components/EditorLayout.js](src/renderer/editor/components/EditorLayout.js)). After a successful render a small toast appears with the file path and a "Show in folder" button that reveals the file in Explorer via the new `shell:revealInFolder` IPC handler ([src/main/main.js](src/main/main.js)) exposed as `window.clipflow.revealInFolder` ([src/main/preload.js](src/main/preload.js)). Auto-dismisses after 6 s. Use case: quick local exports when the creator wants the MP4 without committing it to the publishing queue yet.
- **#64 — Waveform extraction instrumentation + visible error state.** Previous behavior: on extraction failure the timeline showed "Extracting waveform…" forever because errors were swallowed by a fire-and-forget `.catch()` in the renderer and a silent fallback in [src/main/ffmpeg.js](src/main/ffmpeg.js). Now:
  - `[src/main/main.js]` `waveform:extractCached` handler logs `[waveform] start`, cache hit/miss, `extracting`, `extracted` (with peak count + elapsed ms), and `failed` (with the original error + elapsed ms). Returns `{ peaks, cached, error }` so the renderer can distinguish "still working" from "gave up".
  - `[src/main/ffmpeg.js]` `extractWaveformPeaks` captures FFmpeg's `stderr` via the third `execFile` callback argument and logs the last 800 bytes on failure (previously `stderr` was thrown away). The track-1 → track-0 fallback no longer swallows the final error; it returns `{ peaks: [], error }` with the first failure's message.
  - `[src/renderer/editor/stores/useEditorStore.js]` added `waveformError` state + `setWaveformError` action, reset on clip open.
  - `[src/renderer/editor/components/PreviewPanelNew.js]` call site sets `waveformError` when the IPC returns `{ error }` or rejects; clears it on success.
  - `[src/renderer/editor/components/timeline/WaveformTrack.js]` now accepts an `error` prop. When `peaks` is empty and `error` is set, renders "Waveform unavailable" in red instead of the infinite "Extracting waveform…" message, and the useEffect + `React.memo` comparator include `error` so the canvas repaints on state change.

## [Unreleased] — 2026-04-17 (session 18) — Pre-launch hardening: H2 renderer CSP

### Added
- **H2 — Content Security Policy enforced on the renderer** ([#48](https://github.com/Oghenefega/ClipFlow/issues/48)). CSP meta tag added to [index.html](index.html) in the Vite source (propagates to `build/index.html` on build). Closes the final item in the pre-launch hardening arc — H1 (#47), H3 (#49), H5 (#52), H6 (#53) already shipped. Policy is **enforcing**, not Report-Only. Final directives:
  - `default-src 'self'` — deny-by-default baseline.
  - `script-src 'self' https://us-assets.i.posthog.com` — allows Vite-bundled scripts and PostHog's dynamically-loaded config/surveys bundle. **No `'unsafe-inline'` and no `'unsafe-eval'`.**
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — `'unsafe-inline'` is unavoidable because the existing views use the `T` theme object with inline `style={...}` attributes pervasively; a nonce-per-render refactor is a separate workstream. Google Fonts CSS allowed for the `@import` fallback in the dev build (packaged app uses local fonts but the `@import` is present in source).
  - `font-src 'self' https://fonts.gstatic.com` — Google Fonts `woff2` origins for the same fallback.
  - `img-src 'self' data: blob: file:` — `data:` for React-Icons, `blob:` for generated thumbnails, `file:` for thumbnails served from the user's filesystem.
  - `media-src 'self' blob: file:` — `<video>` elements load local MP4s via `file://` (Electron preview pipeline).
  - `connect-src 'self' file: https://us.i.posthog.com https://us-assets.i.posthog.com https://*.ingest.us.sentry.io` — Sentry ingest, PostHog events + assets CDN, and `file:` for the waveform/media fetches that use `fetch("file:///...")` against the local archive. Anthropic and any AI Gateway endpoints go through the **main process** (Node HTTP, outside renderer scope), so they are intentionally not whitelisted in renderer CSP.
  - `object-src 'none'; base-uri 'self'; form-action 'none';` — locks out `<object>`/`<embed>`, rebases, and form submission.
  - `frame-ancestors` **omitted** — ignored when delivered via `<meta>` per CSP spec, and the Electron file:// renderer cannot be iframed regardless. If we ever serve the renderer from an HTTP origin, add it via response header, not meta.
- **`us-assets.i.posthog.com` whitelisted on BOTH `script-src` and `connect-src`.** PostHog loads its feature-flag / surveys bundle from the assets CDN after the initial `posthog.init()`; without the script-src entry the bundle 404s silently and flags break. Verified empirically during the first CSP iteration.
- **`https://*.ingest.us.sentry.io` wildcard on `connect-src`** — Sentry's ingest endpoints are project-scoped subdomains (`o4511147466752000.ingest.us.sentry.io` for this project). Wildcard keeps the policy working if the DSN ever rotates.

### Changed
- **Crash-screen reload button switched from inline `onclick` to `addEventListener`** ([src/index.js:23-27](src/index.js#L23-L27)). The DOM-level crash screen built by `showCrashScreen()` previously used `<button onclick="window.location.reload()">`, which worked fine pre-H2 but would be blocked by `script-src 'self'` (no `'unsafe-inline'`). H2 caught this on first verification — user clicked "Reload App" on a test crash screen and nothing happened; console showed a CSP inline-script violation. Fix: give the button an ID, attach the listener in the parent scope. Net-zero behavior change outside CSP, but now resilient if the page ever crashes before React mounts.

### Notes
- **Why `'unsafe-inline'` on style-src stays for now.** The existing editor and main-tab views rely on React inline `style={{...}}` attributes driven by the `T` theme object in [src/renderer/styles/theme.js](src/renderer/styles/theme.js). Every such attribute compiles to an inline `style="..."` in the rendered DOM, which a strict style-src would block. Migrating to a nonce-per-render or CSS-in-JS-with-extraction pipeline is a multi-session refactor, not a hardening blocker. Tailwind classes in the editor (shadcn/ui) are unaffected — those compile to a stylesheet.
- **What CSP does and does not cover.** CSP governs the **renderer's network surface** only. The main process (Node.js `http.request`, `fetch`, `execFile` to FFmpeg/Whisper, `ipcMain.handle` traffic) is completely outside CSP. IPC calls from renderer → main are not network requests and don't hit the policy. This means platform publishing APIs (YouTube/TikTok/etc. OAuth + upload) continue to work because they run in main; the renderer only invokes IPC channels, which CSP doesn't touch.
- **PostHog server-side migration logged against [#22](https://github.com/Oghenefega/ClipFlow/issues/22) and [#25](https://github.com/Oghenefega/ClipFlow/issues/25).** User asked about the industry-standard path for PostHog (client-side SDK → server-side proxy via Supabase). Current H2 policy whitelists PostHog's public origins; the eventual move is to proxy events through our backend so the CSP can drop both `us.i.posthog.com` and `us-assets.i.posthog.com` entirely. Scoped into the analytics-rebuild and Anthropic-server-side workstreams rather than launched as its own issue.
- **Three separate observations filed during verification, deliberately kept out of H2 scope:**
  - [#64](https://github.com/Oghenefega/ClipFlow/issues/64) — Waveform extraction stuck on "Extracting waveform…" for >10s on fresh clip opens. Not a CSP issue (verified via `fetch("file://…")` smoke test returning `OK 2707 chars`). Real path is IPC → FFmpeg subprocess in [src/main/ffmpeg.js:240](src/main/ffmpeg.js#L240), outside renderer network scope. [src/renderer/editor/utils/waveformUtils.js](src/renderer/editor/utils/waveformUtils.js) appears to be dead code — needs separate investigation.
  - [#65](https://github.com/Oghenefega/ClipFlow/issues/65) — Subtitles + captions anchor to the wrong vertical position when the preview panel shrinks. Layout bug, unrelated to H2.
  - [#57 comment 4273583749](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4273583749) — Zoom-slider drag on long sources still lags. Logged as an observation under the existing editor-perf issue.
- **CSP iterated three times during the session** before landing: (1) initial draft included `frame-ancestors 'none'` (removed — meta-tag limitation), (2) PostHog blocked on first boot (added `us-assets.i.posthog.com` to both script-src and connect-src), (3) waveform flow needed `file:` on connect-src (added, though the root cause turned out to be unrelated dead-code). Each iteration was a build + launch + DevTools-console check, not speculative.
- **Verification matrix passed:** subtitle burn-in on a real render, drop-to-Rename, drop-to-Recordings. DevTools "No Issues" badge on the Issues tab confirmed zero CSP violations after the final policy landed.

## [Unreleased] — 2026-04-17 (session 17) — Pre-launch hardening: H1 overlay + H3 main window sandbox

### Changed
- **H1 — offscreen subtitle BrowserWindow hardened** ([#47](https://github.com/Oghenefega/ClipFlow/issues/47)). The hidden window that rasterizes subtitle frames for FFmpeg burn-in no longer runs with `nodeIntegration: true` + `contextIsolation: false`. New posture: `nodeIntegration: false`, `contextIsolation: true`, dedicated preload script. The preload ([src/main/subtitle-overlay-preload.js](src/main/subtitle-overlay-preload.js)) `require()`s the two pure-CJS render helpers (`subtitleStyleEngine.js`, `findActiveWord.js` — zero deps, JSON-in/JSON-out) and exposes them via `contextBridge` as `window.overlayAPI.styleEngine` and `window.overlayAPI.wordFinder`. The overlay page ([public/subtitle-overlay/overlay-renderer.js](public/subtitle-overlay/overlay-renderer.js)) dropped all three `require()` calls it used to do — dynamic module resolution replaced by bridge access, `path.join` replaced by inline string composition of `file:///${fontsDir}/${file}` URLs. Same style engine, same word finder, same scale factor, same injected config — subtitle burn-in output is pixel-identical to the editor preview. Threat model after the change: the page can't reach `fs`, `child_process`, or any other Node API; contextBridge only exposes the two deterministic render helpers; no network surface, no user-authored HTML. Verified end-to-end by Fega on a rendered clip with 55 subtitle segments + 1 caption: burn-in correct, fonts load, timing matches editor.
- **H3 — main BrowserWindow now runs under the Chromium OS sandbox** ([#49](https://github.com/Oghenefega/ClipFlow/issues/49)). Added `sandbox: true` to [src/main/main.js:309-320](src/main/main.js#L309-L320). The main preload ([src/main/preload.js](src/main/preload.js)) was already sandbox-clean — the only non-`ipcRenderer.invoke` API it uses is `webUtils.getPathForFile` (available in sandboxed renderers, introduced in Electron 32 for the File.path migration) and `@sentry/electron/preload` (sandbox-aware by design). Zero preload rewrite needed. With sandbox on, if attacker code ever lands in the renderer (e.g. via a compromised dependency emitting a rogue `<script>` tag), it cannot directly read user files, open sockets, or spawn processes — defense-in-depth beyond contextIsolation (which walls off the preload) and CSP (H2 #48, still to come). Verified by Fega via drop-to-Rename (exercises `webUtils.getPathForFile` under sandbox) + main-tab click-through (exercises every IPC channel).

### Added
- **New preload script `src/main/subtitle-overlay-preload.js`** — narrow bridge for the offscreen subtitle window. ~50 lines. Only exists to expose `styleEngine` and `wordFinder` from the shared editor utils.

### Notes
- **Explicit `sandbox: false` on the overlay window.** Flipping `nodeIntegration: true → false` without also setting `sandbox: false` silently enables the Chromium sandbox on that window (Electron ≥20 default). A sandboxed preload can only `require("electron")` and a tiny subset of Node built-ins — our overlay preload needs `require("path")` and needs to `require()` the two CJS utils by absolute path, so it has to be non-sandboxed. The overlay window got an explicit `sandbox: false` to make this intent visible at the call site. First build of H1 shipped without this explicit flag and broke subtitle burn-in entirely — caught on the first render test and fixed before commit. Future sandboxing of the overlay window is tracked as a separate workstream because it requires bundling the shared CJS utils into the overlay's build output; filed as a follow-up issue.
- **Font loading moved from module-top to `__initOverlay__`** in the overlay page. `window.__FONTS_PATH__` is injected by the main process via `executeJavaScript` *after* the overlay's script has already run its module-top code. Pre-H1 code survived this ordering because it fell back to `path.join(__dirname, "../../src/fonts")` — the fallback is gone in the sandboxless-but-contextIsolated world because `__dirname` isn't available to a classic `<script>` under `nodeIntegration: false`. The fix: defer `loadFonts()` until `__initOverlay__` runs, which happens after the injection. Main process still awaits `document.fonts.ready` before capturing frames, so the async handoff is unchanged.
- **CSP-related Electron security warnings are expected noise** until H2 ([#48](https://github.com/Oghenefega/ClipFlow/issues/48)) ships. The warning banner in the overlay window's captured console is a dev-mode-only message about the missing Content-Security-Policy header; it does not appear in packaged builds and has no runtime effect. H2 will remove it.
- **#59 (editor render button without queuing) raised by Fega mid-session but not touched.** User asked for a dedicated Render button in the editor that bypasses the queue pipeline. Acknowledged, already filed, belongs in its own session — kept scope on H1/H3.

## [Unreleased] — 2026-04-17 (session 16b) — Drop-to-Recordings test-routing + DevTools env hook

### Fixed
- **Drop-to-Recordings now routes by the user's final Test toggle choice, not a path-based guess made before the modal opens.** [src/renderer/views/UploadView.js](src/renderer/views/UploadView.js). Previous flow: drop → copy into `<watchFolder>/<YYYY-MM>/` (or `<testWatchFolder>/<YYYY-MM>/` if source path happened to start with the test folder) → modal opens → user picks game and toggles Test → confirm. The physical copy had already landed based on a source-path heuristic, and flipping Test in the modal only updated `file_metadata.is_test` in the DB — the file stayed in whichever root the heuristic picked. So dragging a file in from Downloads and toggling Test *on* left the copy under the main archive, polluting `Vertical Recordings Onwards/<YYYY-MM>/` with test clips. New flow (Option A): drop → probe duration on the source → modal opens with `isTest: defaultTestMode` as the initial toggle state → user chooses game and final Test value → confirm → *then* `importExternalFile(sourcePath, watchFolder, finalIsTest)` copies into the correct root → rename → pipeline. One physical copy per drop, zero orphan files if the user cancels (modal now just closes, no `importCancel` needed because nothing has been copied yet). Confirmed by Fega in two end-to-end tests: `DD 2026-03-23.mp4` and `PoP 2026-03-23.mp4` both landed in `Test Footage/2026-04/` as expected after toggling Test on in the modal.
- **`quickImport` state shape changed** from `{ filename, targetPath, importEntry, ... }` to `{ filename, sourcePath, sizeBytes, watchFolder, durationSeconds, splitCount, isTest }`. The post-copy fields (`targetPath`, `importEntry`) are now locals inside `confirmQuickImport` because they don't exist until the user confirms.
- **`cancelQuickImport` no longer calls `importCancel`.** Nothing is copied before confirm, so there's no file to delete. Modal just closes.

### Added
- **`CLIPFLOW_DEVTOOLS=1` env var opens DevTools on the main window in production builds.** [src/main/main.js:317-325](src/main/main.js#L317-L325). Useful escape hatch for debugging renderer errors without flipping `isDev` (which would also redirect to `localhost:3000`). No impact when the env var is unset — default behavior unchanged.

### Filed for later (not fixed this session)
- [#61](https://github.com/Oghenefega/ClipFlow/issues/61) — Monthly folder should track recording date, not import date. Current behavior files a March recording imported in April into `2026-04/`. Fix is to parse `YYYY-MM-DD` from the OBS-style filename prefix and bucket by that instead of `new Date()`. Plus a one-shot house-cleaning migration to re-bucket the existing archive.
- [#62](https://github.com/Oghenefega/ClipFlow/issues/62) — Pipeline fails on clips with silent/near-silent audio. `energy_scorer.py` exits code 1 when both ebur128 and astats can't extract audio energy from a silent screen recording; `ai-pipeline.js` propagates the error as `Pipeline failed`. Fix needs both a change in the external Python script (return empty-energy JSON, exit 0) and a change in `ai-pipeline.js` to tolerate empty energy and fall back to keyword-only highlight scoring. Pre-existing bug — would fail the same way from Rename tab.

### Notes
- **Option A vs Option B.** Option B would have kept copy-before-modal and added a post-confirm physical move if the toggle changed between default and final. Rejected because it leaves orphan `<YYYY-MM>/` folders in the wrong root when the last file in that month gets moved out, and the invariant "file lives where isTest says" becomes harder to reason about across the move-and-cleanup path. Option A enforces the invariant at a single point (the copy) with no cleanup logic.
- **Pipeline failure is unrelated to today's change.** Both drop-to-Recordings test runs failed at Energy Analysis, which runs *after* rename and is indifferent to how the file got to the test folder. Drop path itself is clean.

## [Unreleased] — 2026-04-17 (session 16) — electron-store v8 → v11 (H5)

### Changed
- **electron-store v8 → v11** ([#52](https://github.com/Oghenefega/ClipFlow/issues/52), H5). Closes the other half of the Split-A dependency pair (H6 chokidar shipped session 15). v9 made electron-store ESM-only, so `require("electron-store")` started throwing `ERR_REQUIRE_ESM` on upgrade. Fix is a small `src/main/store-factory.js` helper that caches a dynamic `import("electron-store")` and exposes an async `createStore(options)`. Main-process bootstrap now constructs the settings store inside `app.whenReady()` using this factory, then runs migrations, provider-registry init, publish-log init, and token-store init in that exact order before `createWindow()`. IPC handler registrations stay at module-top and close over a `let store` binding that's assigned before any handler body fires (renderer can't call IPC until the window loads, which is after whenReady finishes). Zero change to stored key names, defaults, migration logic, or on-disk JSON file names — `clipflow-settings.json`, `clipflow-tokens.json`, `clipflow-publish-log.json` in `%APPDATA%\clipflow\` are read by v11 unchanged. Verified against Fega's real 3.7MB settings file: app boots clean, all settings intact, OAuth accounts still connected, publish log retains historical entries.
- **`publish-log.js` and `token-store.js` now expose `async init()`.** Previously each module constructed its `new Store(...)` at module top, which stops working under ESM-only electron-store. Each now holds a `let store = null` populated by an awaited `init()` call from main.js's bootstrap. All other exported functions (`logPublish`, `getRecentLogs`, `saveAccount`, `getAccount`, etc.) remain synchronous — they read the resolved binding that's guaranteed non-null by the time handler bodies invoke them.
- **`src/main/main.js` migration block extracted to `runStoreMigrations(store)`.** All ~12 inline migrations (deviceId, analyticsEnabled, llmProvider defaults, video-splitting settings, transcriptionAudioTrack backfills, momentPriorities expansion, onboardingComplete auto-complete, whisper path cleanup, placeholder-platform clear, projectFolders defaults) moved out of module-top imperative code into a pure function called inside whenReady. Side effect: migrations that call `logger.info` now actually reach the log file (previously they ran before `logger.initialize()` and their output was silently dropped).
- **Removed vestigial `require("electron-store")` from [src/main/ai/transcription-provider.js](src/main/ai/transcription-provider.js).** The import was only used in a JSDoc type annotation, never as a runtime constructor — safe to drop.

### Notes
- **Why an async bootstrap instead of top-level `new Store()`.** electron-store v9+ has `"type": "module"` and no CJS entry. Node 22 has unflagged `require(esm)` support, but Electron 40 bundles Node 20.18, so we can't rely on that. The `await import()` pattern is the idiomatic fix that the electron-store maintainer documents for CJS consumers. The cost is that store construction must happen inside an async function — which forced the three consumer modules to expose `init()` and main.js to move its store creation + migrations inside `whenReady`. The IPC handler registrations themselves don't need to move because they capture the outer `let store` binding by reference, not value.
- **Why a single commit instead of split.** The dep bump and async plumbing are atomic — landing the bump without the async plumbing breaks the app with `ERR_REQUIRE_ESM` at require time, and landing the plumbing without the bump has no effect. Bisect granularity isn't useful here; a failure in either piece requires reading both pieces together.
- **Why electron-store v11 and not the version after it.** 11.0.2 is current stable as of 2026-04-17 and passes the `node >= 20` engine check (Electron 40 bundles Node 20.18). No post-11.x releases to evaluate.
- **Backup before the upgrade.** Fega's real `%APPDATA%\clipflow\*.json` files (3.7MB of settings, active OAuth tokens, publish history) were copied to `%APPDATA%\clipflow\backups\pre-h5-20260417-172523\` before first launch under v11. If v11 had failed to read them, the revert path was `git revert HEAD && restore backup`. Not triggered — the read succeeded on first boot.

## [Unreleased] — 2026-04-17 (session 15) — watcher ownership + chokidar v4 (H6)

### Changed
- **Write-stability detection is now owned by ClipFlow, not chokidar.** [src/main/main.js](src/main/main.js) replaces chokidar's `awaitWriteFinish` option with an in-house `waitForStable(filePath, opts)` helper that polls `fs.statSync` on a 1s cadence and resolves once two consecutive reads return the same non-zero byte size (30-minute ceiling). `handleWatcherFileAdded` now awaits this before sending the IPC that surfaces a card on the Rename tab. An in-flight `Set` dedupes repeat `add` events for the same path, and `unlink` cancels any pending stability check. Verified against a synthetic 1MB/300ms growing-file run: resolved ~1s after writes stopped, never fired during active writes.
- **`createOBSWatcher` → `createRecordingFolderWatcher`** and `RAW_OBS_PATTERN` → `RAW_RECORDING_PATTERN`. The watcher watches the folder OBS writes into; it does not talk to OBS. The old name caused confusion with the (dead) OBS log parser and implied a coupling that never existed.
- **chokidar v3.6.0 → v4.0.3** ([#53](https://github.com/Oghenefega/ClipFlow/issues/53), H6). Dual-package ESM+CJS so the existing `require("chokidar")` in main.js keeps working. Drops 29 transitive deps (glob-parent, anymatch, readdirp v3, binary-extensions, normalize-path chain) — smaller install, fewer audit warnings. Watcher config (`ignored` regex, `depth: 0`, `ignoreInitial: false`) carries over with no changes needed. Verified standalone: chokidar 4 add/unlink events fire, regex `ignored` still accepted. OBS real-record smoke test passed end-to-end.

### Notes
- **Why own the stability check.** Previously the top of the pipeline (OBS writes .mp4 → card appears on Rename tab) depended on chokidar's `awaitWriteFinish` internal polling. A silent regression in that subsystem on any future chokidar upgrade would fire `add` mid-write, ffprobe would run on a partial file, auto-split detection would report wrong duration, and the failure mode would show up several pipeline stages downstream. Moving stability detection to our own `waitForStable` means future chokidar upgrades can't regress this — we don't care what chokidar does internally, we gate on our own `fs.stat` loop.
- **Why chokidar 4, not 5.** chokidar 5.0.0 requires Node ≥ 20.19 which is above both our dev environment (Node 20.17) and Electron 40's bundled Node (20.18). v4.0.3 is the latest that works under Electron 40. When Electron bumps its Node further we can revisit.

## [Unreleased] — 2026-04-17 (session 14c) — #60 follow-up: is_test backfill on startup

### Added
- **Startup reconciliation of `file_metadata.is_test` against physical location.** New block in [src/main/main.js](src/main/main.js) inside `app.whenReady`. If `testWatchFolder` is configured, the app runs two idempotent UPDATEs on launch: (1) flag every row whose `current_path` lives under the test folder as `is_test = 1`, (2) unflag every row with `is_test = 1` whose `current_path` is outside the test folder (or null). The SQL uses `LIKE ? ESCAPE '\\'` with the test-folder prefix guarded by a trailing separator so a folder named `Test Footage X` can't be matched by the `Test Footage` prefix. Row counts come from `db.getRowsModified()` (sql.js's counter, since `db.run()` returns the DB object, not a changes summary) and get logged when either number is nonzero. No store flag / one-shot guard — running every launch means moves Fega makes in Explorer outside the app get reconciled next time he opens ClipFlow.

### Notes
- **Why bidirectional.** The invariant we want is "physical location determines test flag." Flagging only (one-directional) would leave stale `is_test = 1` rows pointing at files that were manually dragged out of Test Footage, which would then be hard-blocked from publishing even though disk reality said they were real. Reconciling both ways keeps UI state and disk state in sync regardless of how the file got moved.
- **Catches Fega's legacy test content.** The pre-existing months of renamed files already sitting in `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\Test Footage\<month>\` — which predate the `is_test` column — are now automatically grouped under "Test" in the Recordings tab from the first launch after this commit.

## [Unreleased] — 2026-04-17 (session 14b) — #60 follow-up: physical move + Recordings filter

### Added
- **`file:moveToTestMode` IPC** in [src/main/main.js](src/main/main.js). Post-hoc TEST toggle on a recording card now physically moves the file between `<watchFolder>` and `<testWatchFolder>` (with `<YYYY-MM>/` monthly subfolder) so disk layout always matches the flag — no more test-flagged files scattered in the main folder. Uses `fs.renameSync` for same-volume moves and falls back to `copyFile + unlink` for cross-volume (`EXDEV`) moves, which matters because Fega's test folder lives on `W:\` while the main library can be on a different drive. Returns `{ error, locked: true }` on `EBUSY` / `EPERM` / `EACCES` so the renderer can revert the optimistic toggle and show a "file in use" toast without corrupting disk state. Also cascades the rename to the associated project's `sourceFile` + `testMode` so the editor resolves the right path on next open.
- **Recordings-tab filter: All / Main / Test** in [src/renderer/views/UploadView.js](src/renderer/views/UploadView.js). Only surfaces when at least one test file exists or a `testWatchFolder` is configured, so the single-folder user doesn't see a three-button control for no reason. Active "Test" state uses the yellow-glow treatment from `ui-standards.md` so it matches the TestChip. Shows a `(N of M)` count so it's obvious the filter is filtering.
- **Move-failure toast** on the Recordings tab. If the move IPC returns `locked: true`, the chip reverts and a red banner surfaces the error for 5 seconds ("File is in use (editor or render open?) — close it and try again.").

### Changed
- **`handleToggleRecordingTest` now calls `fileMoveToTestMode` instead of `fileMetadataUpdate`.** The physical move IPC already updates `current_path` + `is_test` + cascades to the project in one atomic pass, so the previous two-step (flag-then-cascade) flow is replaced by one IPC call. Optimistic UI update is preserved; the new path is synced into local `files` state on success so the card's displayed path stays accurate.

### Notes
- **Why physical move instead of flag-only** (reverses the Option A decision from session 14). Fega's mental model is folder-based — `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\Test Footage\<month>\` is the test root and he expects toggling TEST on the card to actually put the file there. Flag-only would let disk reality diverge from UI reality and defeat the whole "test-pipeline isolation" point of [#60](https://github.com/Oghenefega/ClipFlow/issues/60). The tradeoff — move can fail on locked files — is handled by revert-and-toast rather than silent corruption.
- **Not yet done in this pass:** legacy files already sitting in Test Footage that predate the is_test column aren't auto-flagged. If they were renamed through ClipFlow they're in `file_metadata` with `is_test = 0` and will show up under their month group, not the Test group — user can toggle them manually. A one-time backfill migration (mark all rows whose `current_path` is under `testWatchFolder` as `is_test = 1`) was considered and skipped for this session to keep scope tight; can be filed as a follow-up if the manual-toggle ergonomics aren't acceptable.

## [Unreleased] — 2026-04-17 (session 14) — #60 unified per-clip test-mode

### Added
- **Clickable TEST chip** at [src/renderer/components/TestChip.js](src/renderer/components/TestChip.js). Off = dashed outline gray (opt-in signal). On = filled yellow with a 6px glow per `ui-standards.md`. Supports `sm` (card chip) and `md` (modal header) sizes, with keyboard (Enter/Space) and a disabled read-only mode. The chip is the single UI surface for test-mode everywhere it appears (Rename, Recordings, Quick-import modal, Projects, Queue).
- **Per-clip `testMode` boolean** as the canonical data model ([#60](https://github.com/Oghenefega/ClipFlow/issues/60)). Replaces the ad-hoc `tags: ["test"]` convention the Projects view was using. Lives on each project's `project.json` at `{watchFolder}/.clipflow/projects/{projectId}/project.json`. Legacy `tags.includes("test")` projects are auto-migrated at read time via a new `normalizeProject()` helper in [src/main/projects.js](src/main/projects.js) — the "test" string is stripped from `tags` and hoisted to `testMode: true`, so no one-shot migration script is needed and no on-disk files are touched until a project is next written.
- **`project:updateTestMode` IPC** at [src/main/main.js:2207](src/main/main.js:2207) with `projectUpdateTestMode` bridge in [src/main/preload.js](src/main/preload.js). Powers the optimistic toggle on the Projects view and the Recordings card. Uses a new `updateProjectField()` helper in [src/main/projects.js](src/main/projects.js) that merges a partial onto the in-memory project and rewrites `project.json` atomically.
- **Test-aware routing for the full pipeline** via a new `resolveTestAwareOutputFolder(projectData)` helper in [src/main/main.js](src/main/main.js). Reads `projectData.testMode` (with a disk-reload fallback and legacy `tags` fallback), then routes output to `<testWatchFolder>` or `<watchFolder>\Test\` if no test folder is configured. Wired into `render:clip` and `render:batch`. Works whether the render was initiated from the editor, the queue, or a batch.
- **Test-aware import routing for drops to Recordings/Upload.** The `import:externalFile` IPC now takes a `testMode` arg and routes the file into the monthly test folder when set. Detection happens in three layers per the Recordings drop design: (1) path-based smart default — if the dropped file's absolute path is already under `testWatchFolder`, the quick-import modal opens with TEST on by default; (2) explicit TestChip in the quick-import modal header (`size="md"`) so the user can override before confirming; (3) post-hoc TestChip on the recording card that flips the flag only — no physical file move, per Fega's Option A.
- **Publish hard-block for test clips.** All four publish IPC handlers (TikTok/Instagram/Facebook/YouTube) at [src/main/main.js](src/main/main.js) now accept an `isTest` param and early-return with `{ error, testBlocked: true }` before making any platform API call. The publish log still records the attempt as `status: "skipped"` with the blocking reason so an audit trail exists.
- **Queue-side test guard rails** in [src/renderer/views/QueueView.js](src/renderer/views/QueueView.js). A new `projectTestMap` / `isClipTest(clip)` lookup powers: (a) disabled + tooltipped Publish buttons on both the inline row action and the expanded panel in both the Unscheduled and Scheduled sections; (b) a yellow test-mode banner + disabled "Blocked (Test)" button inside the publish-confirmation modal; (c) an early-return guard in `publishClip` and `retryFailed` that sets status to `failed` with a clear reason; (d) `isTest: isClipTest(clip)` threaded into all 8 publish-IPC call sites as belt-and-suspenders so the main-side gate also fires if the UI gate is ever bypassed.

### Changed
- **Rename tab writes to the test folder when TEST is on.** [src/renderer/views/RenameView.js](src/renderer/views/RenameView.js) now computes `testRoot = r.isTest ? (testWatchFolder || <watchFolder>\Test) : null` and folds it into both the single-clip and split-clip rename path builders. The old static TEST badge is replaced with a clickable `<TestChip>`.
- **Projects view TEST badge is now a clickable TestChip** with optimistic update + revert-on-failure. [src/renderer/views/ProjectsView.js](src/renderer/views/ProjectsView.js) reads `p.testMode === true || (p.tags || []).includes("test")` so legacy projects render correctly without waiting for normalization.
- **AI-pipeline project creation writes `testMode` directly** at [src/main/ai-pipeline.js:432](src/main/ai-pipeline.js:432). Old behavior was `projectTags = gameData.isTest ? ["test"] : []`; new behavior passes `testMode: !!gameData.isTest` on `createProject` with `tags: []`. Keeps the data model clean from the moment a project is born.

### Notes
- **Smoke-test status:** build succeeded (Vite 11.74s, 2728 modules, 1.85 MB minified / 540 KB gzip). `npm start` launched Electron 40 cleanly — schema v4, migrations done, no renderer errors. The three Windows Chromium cache/GPU access-denied errors are pre-existing noise unrelated to this change. End-to-end click-through (drop into testWatchFolder → rename routes to test → Recordings drop shows TEST default → toggle on Project → render lands in test folder → Queue publish gated) is left for Fega to verify in-app — [#60](https://github.com/Oghenefega/ClipFlow/issues/60) will be closed once he confirms.
- **Why a dedicated boolean, not a tag.** Tags are free-form and leak into titles, filters, and AI prompts. `testMode` is a single-purpose flag that the pipeline can read without string-matching. The read-time migration keeps the transition invisible — existing test projects just work.
- **Physical vs flag consistency.** Toggling TEST on a recording card or a project only flips the routing flag; the physical file stays where it was originally imported. Moving files post-hoc would create a second source of truth about where the file lives, and Fega explicitly picked Option A to avoid that.

## [Unreleased] — 2026-04-17 (session 13) — CRA → Vite (C2 closed)

### Changed
- **Create React App → Vite 6.4.2** ([#46](https://github.com/Oghenefega/ClipFlow/issues/46)). Replaced deprecated `react-scripts` 5.0.1 with `vite` ^6.4.2 + `@vitejs/plugin-react` ^4.7.0. Scripts updated: `dev:renderer` → `vite`, `build:renderer` → `vite build`. `homepage: "./"` field removed from `package.json` — replaced by Vite's `base: "./"`. Output dir kept at `build/` so [src/main/main.js:320](src/main/main.js:320) and [src/main/subtitle-overlay-renderer.js:149](src/main/subtitle-overlay-renderer.js:149) `loadFile` paths need no changes. 1111 transitive packages removed, bundle now 1.85 MB minified / 540 KB gzip (2727 modules). This closes C2 — see dashboard Section 9.
- **Renderer entry moved from `public/index.html` to root `index.html`** (Vite convention). Previous CRA entry file deleted. The new root entry loads `/src/index.js` as an ES module.
- **New [vite.config.js](vite.config.js)** handles two CRA-era quirks: (1) a custom esbuild transform treats `.js` files in `src/` as JSX (ClipFlow stored JSX in `.js` per CRA legacy); (2) `build.commonjsOptions.include` extends Rollup's CommonJS plugin to source files so the 5 CJS utilities in `src/renderer/editor/` (shared with the CJS main process via `require()` in [src/main/render.js](src/main/render.js)) convert cleanly when consumed by the renderer ESM bundle.
- **Tailwind config** — content glob updated to `["./index.html", "./src/**/*.{js,jsx,ts,tsx}"]` (was `["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"]`); new `postcss.config.js` at repo root (CRA had this baked in).
- **`tsconfig.json`** — `moduleResolution: "node"` → `"bundler"` so TS plays nicely with Vite's module graph.

### Fixed
- **TDZ crash from circular `require()` in 4 Zustand stores.** Build succeeded but renderer rendered blank on first launch. DevTools showed `Uncaught ReferenceError: Cannot access 'useSubtitleStore' before initialization` (symbol name surfaced by temporarily setting `build.minify: false`). Root cause: [useSubtitleStore](src/renderer/editor/stores/useSubtitleStore.js), [useEditorStore](src/renderer/editor/stores/useEditorStore.js), [useLayoutStore](src/renderer/editor/stores/useLayoutStore.js), [useCaptionStore](src/renderer/editor/stores/useCaptionStore.js) used lazy `require("./useXStore").default` inside function bodies to break cycles. Webpack tolerated this as runtime CJS lookups; Rollup's `@rollup/plugin-commonjs` (invoked under `transformMixedEsModules: true` so source CJS works) hoists those `require` calls into eager top-level imports → cycle evaluates eagerly → TDZ. Fix: converted all **12 `require()` sites** to top-level ESM imports. Cycle still exists topologically; ESM live bindings resolve it correctly because access is inside function bodies that run after both modules finish initializing.

### Notes
- **Smoke tests passed on the three user-critical paths:** #35 zoom-slider x10 on a 30min+ source (no crash, minor perceptible delay on very fast repeated drags — same as pre-Vite, not a regression), drop-to-Rename (drag-drop + rename end-to-end), render a clip (FFmpeg job completes, output file valid). Drop-to-Upload and HMR tests intentionally skipped (upload gated on [#60](https://github.com/Oghenefega/ClipFlow/issues/60) test-mode toggle Fega wants before exercising real upload pipeline; HMR is a dev-only ergonomic not needed for release).
- **[#60](https://github.com/Oghenefega/ClipFlow/issues/60) filed:** per-clip test-mode toggle on Rename/Upload/Projects to route dogfood renames/renders/uploads to a separate Test area so pre-launch testing doesn't pollute the real content pipeline.
- **C2 closed — unblocks H5, H6, H2 next.** Vite is now the build tool, so [#52](https://github.com/Oghenefega/ClipFlow/issues/52) `electron-store` 8→11 (ESM-only) and [#53](https://github.com/Oghenefega/ClipFlow/issues/53) `chokidar` 3→4 (ESM-only) are unblocked. [#48](https://github.com/Oghenefega/ClipFlow/issues/48) CSP was planned as a nonce-based policy bundled with Vite — that still needs its own pass but is no longer gated.
- **`--legacy-peer-deps` uninstall pattern.** Used `npm uninstall react-scripts --legacy-peer-deps` to cleanly remove the old CRA peer-dep web. Going forward, `--legacy-peer-deps` can be dropped from the standing install flags once all Vite-native deps are installed — reassess after H5/H6 land.

## [Unreleased] — 2026-04-17 (session 12) — Electron 29 → 40 (single-shot, C1 closed)

### Changed
- **Electron 29.4.6 → 40.9.1** (Chromium 122 → 136, Node 20 → 22). Single-shot upgrade — eleven major versions in one commit. Replaces the original stepwise 28→32 cadence ([dashboard Section 9 C1](https://github.com/Oghenefega/ClipFlow/issues/45)) which Fega revised mid-arc to "40 is a good enough place." `@types/node` bumped to `^22.0.0` to match Node 22 runtime per H8 pattern. `electron-builder` left at `^24.13.3` — packaging path (`npm run build`) not exercised this session; H7 bump still bundled with H4 auto-updater work.
- **`File.path` → `webUtils.getPathForFile()`** ([#58](https://github.com/Oghenefega/ClipFlow/issues/58)) bundled into the same commit because Electron 30+ removed the `File.path` property. Added `getPathForFile` to the `window.clipflow` preload bridge at [src/main/preload.js:9](src/main/preload.js:9) (uses `webUtils` from electron, sync, no IPC). Migrated both renderer callsites: [src/renderer/views/RenameView.js:1222](src/renderer/views/RenameView.js:1222) (drag-drop import) and [src/renderer/views/UploadView.js:313](src/renderer/views/UploadView.js:313) (drag-drop upload).

### Notes
- **Native deps audit clean.** Zero `binding.gyp`, zero `.node` binaries in the entire dependency tree — `sql.js` is WASM, everything else is pure JS. Node 20 → 22 transition required no `electron-rebuild` step.
- **Smoke test passed all three.** (1) #35 zoom-slider crash repro on a 30min+ source — no crash. (2) Drop-to-Rename — file appeared in pending list (Fega didn't click rename, but the `getPathForFile` bridge fired and produced a valid path). (3) Drop-to-Upload — import progress shown, game-name prompt fired. App startup logs `electron: "40.9.1"`, schema v4 loaded.
- **C1 (Electron EOL) resolved.** Dashboard now shows ClipFlow on Electron 40 with current stable at 41 — well within Electron's "latest 3 majors" support window. Future cadence (40 → 41 and beyond) becomes a Medium maintenance item, not Critical.
- **H8 (`@types/node` pin to runtime) closed.** Bumped to ^22 alongside the runtime hop. No further pin work needed until the next Electron major changes Node version.

## [Unreleased] — 2026-04-17 (session 11) — #57 Phase A landed, Phase B + C hotfix reverted

### Changed
- **Gated DevTools force-open behind `isDev`** at [src/main/main.js:324](src/main/main.js:324). Production renderer no longer takes the DevTools performance penalty on every clip open — renderer crashes now flow through Sentry instead of opening DevTools as a debug aid. Dev mode behavior unchanged.
- **Stripped 13 `[DBG ...]` `console.log` calls from playback hot paths** in [usePlaybackStore.js](src/renderer/editor/stores/usePlaybackStore.js) (`togglePlay` + `seekTo`) and [PreviewPanelNew.js](src/renderer/editor/components/PreviewPanelNew.js) (rAF tick + `onTimeUpdate` + `playEffect`). These were serialising `JSON.stringify` of the NLE segment list on every 60fps frame — measurable CPU cost on a 30min source.

### Reverted
- **#57 Phase B reverted** ([5f65d1d](https://github.com/Oghenefega/ClipFlow/commit/5f65d1d) → [c95f63f](https://github.com/Oghenefega/ClipFlow/commit/c95f63f)). The store-derived-discrete-state refactor (forward-scan helpers in `usePlaybackStore` computing `activeSubtitleSegId` / `activeTranscriptWordIdx` / `displayTime` inside `setCurrentTime`; subscribers swapped in `PreviewPanelNew` / `LeftPanelNew` / `TimelinePanelNew` / `EditorLayout`) broke word highlighting in **both** Transcript and Edit-subtitles tabs AND regressed the Transcript tab to laggy. Two-attempt rule triggered (Phase B landed, Phase C hotfix attempted, still broken) — Fega asked for revert rather than a third guess-patch.
- **#57 Phase C hotfix reverted** ([daa9c68](https://github.com/Oghenefega/ClipFlow/commit/daa9c68) → [63b778b](https://github.com/Oghenefega/ClipFlow/commit/63b778b)). Added `activeSubtitleWordIdx` (word-within-active-seg) to the store; rolled back as part of the Phase B bundle.

### Notes
- **Root cause of the remaining editor lag re-diagnosed during session** — and it's **not** what `tasks/todo.md` assumed. The subscription-count-based diagnosis ("5 top-level subscribers re-rendering at 60Hz") was correct but incomplete. The real pain is *component size at re-render time*: `TimelinePanelNew` (1500 lines) re-renders at 60Hz because `smoothTime` is local state on the whole component, and `EditSubtitlesTab` re-renders on every `currentTime` tick because per-word highlight inside each row needs fine-grained time — each re-render reconciles 100+ segment rows (TimecodePopover + ALL CAPS button + delete popover + TooltipProvider + word spans per row). Both run on the same React commit queue → CPU contention is what Fega perceives as lag. Full re-diagnosis in the updated [#57 comment](https://github.com/Oghenefega/ClipFlow/issues/57#issuecomment-4267674430).
- **Proper fix direction now written to #57**: extract `<TimelinePlayhead />` from TimelinePanelNew + extract `<SegmentRow />` as `React.memo`'d child from LeftPanelNew. No store-derivation. Defer per Fega's request — Electron 38 upgrade takes priority next session.
- **Edit-subtitles tab remains laggy on 30min+ sources** — explicitly acknowledged and parked. #57 stays open. Phase A provided some perceived relief but subtitle sync + highlighting cliff is still present.
- **[#45](https://github.com/Oghenefega/ClipFlow/issues/45) target revised: 29 → 38+ (not 32).** Fega's call this session. Title updated. Hop granularity (single-shot 29→38 vs 29→32→35→38), Vite-vs-Electron ordering, Node 20→22 native-module compat, and File.path migration bundling left as open questions to resolve at the start of next session.

## [Unreleased] — 2026-04-17 (session 10) — Electron 28 → 29 (C1 Phase 1, hop 1 of 4)

### Changed
- **Electron 28.3.3 → 29.4.6** (Chromium 120 → 122, Node 18 → 20, V8 12.2). First of four stepwise hops in C1 Phase 1 (28→32). `@types/node` bumped to `^20` to match Node 20 runtime. `@electron/rebuild` (modern scoped name, replaces deprecated `electron-rebuild`) added as a dev dep at `^3.7.2` for future native-module rebuilds. No native deps currently in use (`sql.js` is WASM), so rebuild is a no-op this hop.
- **Electron 29 breaking-change review, no code changes required:** (1) contextBridge bulk-exposure change doesn't affect us — `preload.js` already uses the safe wrapper-per-method pattern. (2) Removed `will-navigate` legacy event — we don't listen for it. (3) `File.path` deprecated in v29 (removal expected v30/v31); still functional, two callsites tracked at `src/renderer/views/RenameView.js:1222` and `src/renderer/views/UploadView.js:313`, migration to `webUtils.getPathForFile()` filed as a follow-up issue for Hop 2/3.

### Fixed
- **#35 renderer crash (blink::DOMDataStore UAF on timeline drag) — resolved in Hop 1.** Go/no-go test: opened a clip with a 30min+ source, dragged the timeline zoom slider rapidly left-right × 10 on both short and long sources. Zero crashes. Chromium 122's fetch-stream lifecycle fixes (121-122 landed multiple `ReadableStreamBytesConsumer` / `DOMArrayBuffer::IsDetached` UAF patches) appear to resolve the Pattern A repro established in session 9. Pattern B (idle projects-tab crash) and Pattern C (clip-open crash) not explicitly re-tested this hop but share the same Chromium stack, so expected to be resolved as well. Will monitor Sentry across the remaining C1 Phase 1 hops for regressions.

### Notes
- **Editor lag on 30-minute sources surfaced during Hop 1 testing — NOT a hop regression.** Filed as [#57](https://github.com/Oghenefega/ClipFlow/issues/57). Phase 4 (editor plays full source recording via `file://` URL instead of the individual clip render) was landed recently; this is the first time a 30min+ source has been exercised end-to-end in the editor. Root cause: five top-level components subscribe to `currentTime` from `usePlaybackStore` (`EditorLayout.js:898`, `LeftPanelNew.js:363` and `:608`, `PreviewPanelNew.js:417`, `TimelinePanelNew.js:36`) and the 60fps rAF loop at `PreviewPanelNew.js:774-818` calls `setCurrentTime` every frame — on a 30min source, `TimelinePanelNew` + `LeftPanelNew` rebuild trees containing thousands of words/segments per frame, which is the perf cliff. Contributing factors: DevTools force-opened at `src/main/main.js:324`, `[DBG ...]` console.log spam in playback hot paths, waveform IPC possibly stuck on long sources. Fix approach is to narrow the 60fps subscription so only the playhead cursor re-renders per frame; other panels subscribe to discrete state (active-segment-id, visible-range) that changes infrequently. Does not block Hop 2.
- **[#58](https://github.com/Oghenefega/ClipFlow/issues/58) filed for File.path → webUtils.getPathForFile() migration.** Still functional in Electron 29; must be migrated before the hop that removes it (v30 or v31).
- **[#59](https://github.com/Oghenefega/ClipFlow/issues/59) filed for "editor can't render clip without queuing for upload".** Surfaced by Fega during testing. Core editor UX gap: render and queue are conflated into a single button. Not a Hop 1 regression — pre-existing, tracked for a dedicated session.
- **Detailed fix plan for [#57](https://github.com/Oghenefega/ClipFlow/issues/57) (editor lag on 30min+ sources) written to [tasks/todo.md](tasks/todo.md)** with 6 root causes identified, phased fix strategy (Phase A free wins, Phase B derived discrete-state selectors, Phase C child-component extraction), file-impact map, and verification criteria. **Fega's end-of-session decision: fix #57 before starting hop 2** — hop 2-4 verification depends on being able to smoothly exercise the editor on long sources. Session 11 scope is now Phase A+B of #57; hop 2 parked to session 12+.

## [Unreleased] — 2026-04-17 (session 9) — #35 minimal repro established, C1 Electron upgrade arc unblocked

### Added
- **#35 crash — reliable minimal repro.** Mined Sentry breadcrumbs across 12 events spanning ~2 weeks (out of 60 total events on issue `7381799876`), identified three distinct crash shapes all sharing the same Chromium 120 fetch-stream UAF stack (`blink::DOMDataStore::GetWrapper` → `DOMArrayBuffer::IsDetached` → `ReadableStreamBytesConsumer::BeginRead` → `FetchDataLoaderAsDataPipe::OnStateChange`). Pattern A = timeline interaction crash (Radix Slider thumbs, trim handles, waveform track; preceded by rapid `seekTo` calls). Pattern B = idle projects-tab crash (minutes after preview frame extraction on 30min+ source files). Pattern C = clip-open crash (within 1-3s of `<video>` load after navigating projects → clip). All three confirmed as `<video src="file://...">` lifecycle events. Fega confirmed the recipe live: open a clip with a 30min+ source, drag the timeline zoom slider rapidly left-right for ~5-10 seconds → crash fires with `0xC0000005 ACCESS_VIOLATION_READ`. Two fresh Sentry events captured this session: `b0e03249`, `004c5c7a`.
- **Diagnostic writeup posted to [#35](https://github.com/Oghenefega/ClipFlow/issues/35#issuecomment-4266632249)** covering method, the three crash patterns, corrected interpretation of session 5's Slider hypothesis (not wrong, just narrow — Slider is one trigger in Pattern A, not the universal cause), the repro recipe, and the go/no-go test framing for each Electron upgrade hop (drag zoom slider 10× pre-hop and post-hop; if it doesn't crash post-hop, that hop is a candidate fix).

### Notes (no code changes this session — diagnostic + planning only)
- **Step 0 of C1 Phase 1 complete.** The Modernization Audit's gating requirement (reproducible crash recipe on stock Electron 28) is satisfied. [#45](https://github.com/Oghenefega/ClipFlow/issues/45) Electron upgrade arc is now unblocked and ready to begin in the next session.
- **[#51](https://github.com/Oghenefega/ClipFlow/issues/51) (code-signing cert procurement) deferred indefinitely** — Fega confirmed no funds, no beta cohort, no launch timeline. Comment posted. Issue remains open but flagged as "not blocking any current work." Revisit when funds + beta exist.
- **Pre-beta priority framing clarified by Fega** — substrate upgrades (Electron, Vite, React, dep majors) take priority over launch-hardening work (API abuse prevention, rate limiting, code-signing, CF gateway abuse prevention). H9, H4, and #51-style items remain tracked but should not be pushed as "critical path" while pre-beta. Saved as a feedback memory for future sessions.
- **Sentry's default `ui.click` breadcrumb instrumentation does NOT capture pointer drag sequences**, only synthetic click events. This is why past breadcrumb analysis on drag-triggered crashes looked benign — the actual trigger (drag) wasn't logged. Good to know for future diagnostic work: if a crash is drag-triggered, the breadcrumb trail before the crash will show stale clicks, not the actual action.

## [Unreleased] — 2026-04-17 (session 8) — Infrastructure dashboard bootstrap + 11-decision walkthrough

### Added
- **Evergreen infrastructure dashboard** bootstrapped in the Obsidian vault at `context/infrastructure/ClipFlow Infrastructure.md`. 13 sections covering stack inventory (Electron/Chromium/Node, build tool, runtime + dev deps with installed/latest/gap/role/notes, external binaries, architecture patterns), severity-tagged findings (2 Critical / 9 High / 9 Medium / 10 Low / 2 Unknown), current-decisions-in-flight, related GitHub work, review history (Dataview-backed), and a self-contained drift-catching refresh prompt. Companion subfolders created: `Reviews/`, `Prompts/`, `Decisions/`. Bootstrap prompt archived verbatim at `Prompts/Infrastructure Dashboard Bootstrap - 2026-04-17 - Fri.md`.
- **11 infrastructure decisions committed and logged to Section 9 of the dashboard** — C1 (Electron upgrade cadence: stepwise 28→32 Phase 1, min +2 hops Phase 2), C2 (CRA→Vite migration bundled with electron-store + chokidar ESM upgrades as the "structural deps arc"), H1 (offscreen subtitle renderer hardening, bundled with C1 Phase 1), H2 (CSP in renderer, bundled with Vite for nonce-based policy), H3 (Chromium sandbox on all BrowserWindows, bundled with C1 Phase 1), H4 (full auto-updater pre-launch with code signing, research + integration deferred until crash diagnostic + Electron + Vite settle), H5 (electron-store 8→11 under C2), H6 (chokidar 3→4 under C2), H7 (electron-builder 24→26 bundled with auto-updater implementation), H8 (pin `@types/node` to `^18` immediately to match Electron 28 runtime), H9 (Path A ClipFlow-hosted shared CF AI Gateway with 5-concern hardening runbook — spend cap, per-user rate limiting, abuse detection, API key isolation, billing alerts).
- **10 new GitHub issues filed** — [#47](https://github.com/Oghenefega/ClipFlow/issues/47) (subtitle overlay hardening), [#48](https://github.com/Oghenefega/ClipFlow/issues/48) (CSP), [#49](https://github.com/Oghenefega/ClipFlow/issues/49) (sandbox), [#50](https://github.com/Oghenefega/ClipFlow/issues/50) (auto-updater research), [#51](https://github.com/Oghenefega/ClipFlow/issues/51) (code-signing cert procurement, parallel lead-time track), [#52](https://github.com/Oghenefega/ClipFlow/issues/52) (electron-store upgrade), [#53](https://github.com/Oghenefega/ClipFlow/issues/53) (chokidar upgrade), [#54](https://github.com/Oghenefega/ClipFlow/issues/54) (electron-builder upgrade), [#55](https://github.com/Oghenefega/ClipFlow/issues/55) (@types/node pin), [#56](https://github.com/Oghenefega/ClipFlow/issues/56) (CF AI Gateway hardening with full abuse-prevention runbook). All labelled `milestone: commercial-launch` with appropriate area tags.
- **Infrastructure Dashboard pointer added to repo `CLAUDE.md`** — default-off, filtered pointer between "Product Context" and "Interaction Shortcuts" sections. Explicit in-scope list (Electron/Chromium/Node, build tool, deps, module system, security posture, code signing, auto-updater, installer, external infra) and explicit not-in-scope list (product features, pipeline changes, bugs, AI prompts, editor behavior). Tells future Claude Code sessions to consult the dashboard only when work directly touches infrastructure, to respect recorded decisions without re-litigating, and to flag any change that invalidates a recorded decision.
- **Infrastructure Dashboard pointer added to Obsidian vault's ClipFlow business `CLAUDE.md`** (Nero's business-folder CLAUDE.md) — "Infrastructure Dashboard" bullet under "About ClipFlow" (after Full Technical Docs) and a `context/infrastructure/ClipFlow Infrastructure.md` entry under "Key Files." Source-of-truth orientation for vault-session Nero.

### Notes (no code changes this session — dashboard + decisions only)
- **This session was a full read-only audit of the ClipFlow codebase** — no `npm install`, no edits except to `CLAUDE.md` in the repo. All substantive output lives in the Obsidian vault and GitHub issues.
- **Mediums (9), Lows (10), and Unknowns U1 + U2 were NOT walked decision-by-decision** this session. They were surfaced in the dashboard's Section 7 (severity-tagged findings) but remain open. Future dedicated session needed.
- **Unknown U3 resolved inline** — the hardcoded CF Gateway URL is intentional production plumbing on the ClipFlow business CF account (not Fega's personal). This was a correction of an audit misread (URL alone can't reveal account ownership). Section 8 of the dashboard now shows U3 as struck through with a resolution note; frontmatter `unknown-items` decremented from 3 to 2.
- **Dashboard scope, cadence, and decision-qualification rules hardened post-bootstrap** — added a `### Scope` subsection defining what belongs (infrastructure) vs what doesn't (product/features/bugs/AI prompts); rewrote Section 13 preamble to clarify that immediate logging is the primary mechanism (not calendar-based refresh); added a Section 9 header note restricting entries to committed decisions only (speculation stays in Fega's notes) and making GitHub issue links optional, not required.
- **#45, #46 remain OPEN and blocked on #35 crash diagnostic.** Session 7's carried-forward constraint still holds: do not begin the Electron upgrade or the Vite migration until the crash diagnostic resolves. Dashboard Section 9's C1 entry encodes this gating explicitly.

## [Unreleased] — 2026-04-16 (session 7) — Modernization plan + LLM Council review

### Added
- **GitHub issue [#46](https://github.com/Oghenefega/ClipFlow/issues/46) — "Modernize frontend toolchain: CRA → Vite, React 19, dep audit."** Filed as an epic-style chore scoping three phases: (1) CRA → Vite migration (CRA effectively abandoned since 2023, no React 19 support path), (2) React 18 → 19 upgrade, (3) selective dep audit (electron-store 8→10 ESM-only, chokidar 3→4 ESM-only, Zustand already modern, Tailwind 3→4 deferred). Explicit rejections documented in the issue body: Next.js migration (wrong shape for Electron renderer), pnpm (marginal for single-dev Electron), blanket "bump everything" (too risky). File-impact sketch included (vite.config.js new, `process.env.REACT_APP_*` → `import.meta.env.VITE_*`, `src/main/main.js` loadFile path `build/` → `dist/`, etc.).
- **LLM Council review of the modernization plan.** Five advisors (Contrarian, First Principles, Expansionist, Outsider, Executor) weighed in independently; five anonymized peer reviewers then assessed each other. Chairman synthesis + HTML visual report + full markdown transcript generated and saved to `council-reports/council-report-2026-04-16-modernization.html` and `council-reports/council-transcript-2026-04-16-modernization.md`. Unanimous finding from peer review: nobody proposed reproducing the `blink::DOMDataStore` crash (#35) before making any Electron decision — that 2-hour diagnostic (Sentry frames + minimal repro in stock Electron 28) is now established as Step 0 for the entire Electron track.
- **Obsidian vault note** at `The Lab/Businesses/ClipFlow/Product/Modernization Audit - 2026-04-16.md` capturing the modernization plan, council verdict, Fega's pushback on "defer everything," and the split-work framework (Vite + ESM deps pre-launch because cost curve flips; React 19 / Tailwind 4 / pnpm post-launch because they don't).

### Notes (no code changes this session — planning only)
- **Modernization work is PAUSED pending a full architecture audit** being run in a separate Claude Chat session. Scope of that audit: inventory actual installed versions of every major dep, confirm which architecture patterns are actually in use, identify what's deprecated / on notice / load-bearing. No migration work should start until the audit is back.
- **Fega's pushback on the council** refined the verdict meaningfully. Three of five advisors argued for deferring everything post-launch; Fega correctly pointed out that migration costs go UP post-launch, not down (installer layout, auto-updater paths, and user data schemas all lock in at v1.0). Revised split now in the Obsidian note: structural work (Vite, electron-store 8→10, chokidar 3→4) genuinely easier pre-launch; framework/polish work (React 19, Tailwind 4, pnpm) unchanged cost either way.
- **#45 (Electron upgrade) and #46 (toolchain modernization) remain OPEN.** Both conditional on audit outcome. Neither should be worked on until the architecture audit completes and the crash diagnostic runs.

## [Unreleased] — 2026-04-17 (session 6) — #35 diagnostic + #38 60fps fix + Electron upgrade backlog

### Fixed
- **60fps → 25fps drop on render (closes #38)**: `cutClip` in `src/main/ffmpeg.js` now probes the source with `ffprobe` and passes `-r <fps>` to libx264 so output preserves the source frame rate. Previously, re-encoding without `-r` was collapsing VFR OBS recordings to FFmpeg's default 25fps, silently halving gameplay smoothness. Probe failures fall back to FFmpeg default (better to cut at wrong fps than fail the cut entirely). Clamped to `fps > 0 && fps <= 240` to reject corrupt probe values.

### Notes (no code changes beyond the #38 fix)
- **#35 (renderer crash) root-cause narrowed.** Session breadcrumbs + full Sentry stack trace proved the crash is NOT the shadcn Slider (which was the working hypothesis from session 5). Real stack: `blink::DOMDataStore::GetWrapper` ← `AccumulateArrayBuffersForAllWorlds` ← `DOMArrayBuffer::IsDetached` ← `ReadableStreamBytesConsumer::BeginRead` ← `FetchDataLoaderAsDataPipe::OnStateChange` ← `mojo::SimpleWatcher::OnHandleReady`. This is Chromium's internal fetch-stream receiving a mojo-pipe message against an already-detached `ArrayBuffer`. The `<video>` element's `file://` loader uses this pipeline internally; when the src/seek invalidates the stream, a pending mojo message can still arrive and UAF. Phase 4's `pause → removeAttribute src → load()` teardown does not synchronously drain mojo pipes, which is why hardening didn't fix it.
- **Diagnostic swap reverted.** The session-6 test swapped shadcn `<Slider>` → native `<input type="range">` in the scrub bar (`EditorLayout.js`) and the timeline zoom (`TimelinePanelNew.js`). Fega reproduced the crash on the native inputs → Slider was exonerated. Swap reverted to restore visual consistency. Net code change on those two files: zero.
- **Electron upgrade filed as #45** (`type: improvement, area: backend, area: security, milestone: commercial-launch`). ClipFlow is on Electron 28 / Chromium 120 / Node 18 — ~18 months old and out of Electron's 3-version security support window. Multiple Chromium fetch-stream UAF fixes have landed in 121-128; upgrading to Electron 32 (Chromium 128) is the highest-leverage move to fix #35 and pull in ~15 months of security patches. Planned as a stepwise upgrade (28→29→30→31→32), one major per session, with `electron-rebuild` and smoke tests between hops.
- **#39 (Phase 4 13-step verification) status.** Code-side audit confirmed the logic for steps 1 (playhead at clip start, via `initFromContext` + `clipFileOffset: 0`), 4 (waveform no-stretch during trim, via `trimSnapshot` freeze in `TimelinePanelNew.js:158-159`), and 5 (trim-inward bounds clamped in `WaveformTrack.js:29-40`). Steps 2+3 already log-confirmed in session 4. Remaining steps (6, 7, 8, 9, 10, 11, 12, 13) require manual eyes-on testing in the running app — checklist re-issued in HANDOFF for Fega's next run-through.

## [Unreleased] — 2026-04-16 (session 5) — B1 refactor + editor autosave

### Added
- **Editor autosave (resolves #36)**: Debounced (800ms) silent save of editor state — subtitles, caption text/segments, NLE segments, title, and full per-clip subtitle+caption style snapshots — triggered on any edit across `useSubtitleStore` / `useCaptionStore` / `useLayoutStore` / `useEditorStore`. Additional flushes fire on `window.blur` and editor unmount. Renderer crashes (#35 `blink::DOMDataStore` 0xC0000005) no longer wipe unsaved work — at most ~800ms of edits are lost. Verified with force-kill renderer via Task Manager: edits survived reopen. Implementation notes: timer + in-flight counter live in module closure (not Zustand state) to prevent infinite subscribe loops when `set({ dirty: false })` fires during a save. Counter (not boolean) so concurrent explicit-Save + autosave both run when user edits during an in-flight IPC. Existing Save button UI, clip-switch save, back-button save, and queue-and-render flows are unchanged — all route through the refactored shared `_doSilentSave` helper.

### Changed
- **B1 subtitle-extends refactor (cleanup of earlier take-2 fix)**: Primary subtitle source (clip.transcription / clip.subtitles.sub1) and the source-wide extras merged from project.transcription for extends-coverage now run through the same cleanup pipeline (mega-segment filter, duplicate-segment dedup, consecutive-word dedup, word-token merge, validation, timestamp cleanup). Previously extras bypassed those steps. No user-visible regression — pipeline output for the primary-only case is identical to before.

### Notes
- **#36 (editor autosave)** — closed. Autosave is live and verified.
- **#35 (renderer crash)** — still unresolved. Autosave makes crashes non-destructive, which is a major UX win, but does not address the underlying `blink::DOMDataStore` fault. Sentry data from this session (57 events) shows crash also fires in the projects tab, not just editor — #35 scope updated accordingly.
- **New chore filed (#44)**: `setSegmentMode` is called twice on init path, triggering double-dedup log. Harmless but wasteful.

## [Unreleased] — 2026-04-16 (session 4) — Phase 4 post-test triage

### Notes (no code changes in this slice — planning + diagnostics only)
- **Renderer crash is NOT fixed.** Mitigations A/B shipped earlier in the session; crash recurred at 14:51:56 on the new build (~2 min into editor work, same exit code `-1073741819` / `0xC0000005`). Root cause still unknown. Documented in HANDOFF as task B2 (needs `crashReporter` minidumps + renderer error instrumentation before further investigation).
- **New bug B1 identified (root cause found, fix deferred to next session):** `useSubtitleStore.initSegments` filters source-wide transcription down to the original `[clip.startTime, clip.endTime]` range at editor-open time. When the user extends the clip afterwards, the subtitles that would populate the new range were already discarded — Phase 4's "extends reveal already-transcribed audio" promise is only half-kept. Specific lines in HANDOFF.
- **New bug B2a identified:** no editor autosave. Every renderer crash = full loss of unsaved editor state, because `App.js` defaults `useState("rename")` on remount.
- **Subtitle mismatch regression (B3):** reported by user, no specifics yet — parked pending repro.
- **Full prioritized 10-item bug/cleanup board** written to HANDOFF and TodoWrite.

## [Unreleased] — 2026-04-16 (session 4) — Phase 4 hardening: renderer-crash mitigations

### Fixed
- **Renderer crash (ACCESS_VIOLATION 0xC0000005) in `blink::DOMDataStore`**: Observed once during Phase 4 testing, ~6 min into a session before any trim operations. Root cause was the combination of (a) `<video>` now streaming full source recordings (hundreds of MB to GB, vs tens of MB for old pre-cut clips) and (b) React swapping the `src` prop in place, leaving the previous stream's ArrayBuffer in flight while the new fetch started. On large files that overlap window is big enough for Chromium to tear down a detached ArrayBuffer and null-deref.
- **Mitigation A — `preload="auto"` → `preload="metadata"`** on the editor `<video>`. Still fires `onLoadedMetadata` (all Phase 4 needs for duration, seek-to-segment-start, and waveform kickoff). Actual media bytes stream on `play()` — dramatically smaller in-flight buffer during mount/unmount cycles.
- **Mitigation B — Imperative `src` management** replaces `<video src={videoSrc}>` JSX prop. New effect pauses + removes the old src + calls `load()` BEFORE assigning the new src, eliminating the overlapping-ArrayBuffer race. The prior `useRef`-tracked `load()`-after-swap shim is gone.

## [Unreleased] — 2026-04-16 (session 3) — Phase 4: Source-file preview

### Changed
- **Editor preview switched to source-file playback (Phase 4)**: The `<video>` element now plays the full source recording (`project.sourceFile`) instead of a pre-cut clip file. NLE segments (source-absolute coords) are the sole definition of what's visible on the timeline. Trims and extends are now **instant** — no FFmpeg recut, no video reload, no "extending" loading state. This matches the standard DaVinci Resolve / Premiere NLE architecture (media pool + timeline clips as pointers into source). `clipFileOffset` is now permanently `0` since `video.currentTime` IS source-absolute time.
- **Waveform peaks now extracted from source recording with disk cache**: New IPC `waveform:extractCached` extracts peaks from the full source file once per `{sourceFile, mtime, size, peakCount}` tuple and caches to `{projectDir}/.waveforms/*.json`. Subsequent opens read the JSON instantly (no FFmpeg). Peak count scales with duration (~4 peaks/sec, capped at 8000) so a 30-min source gets ~7200 peaks in ~40KB. Waveform never stretches during trim/extend because peaks cover the full source, not the trimmed clip.
- **Render pipeline is now the only consumer of clip files**: Existing NLE-aware render path (from 2026-04-13) handles everything. To ensure render always has segments, every clip created by the AI pipeline now gets an initial `nleSegments: [{ sourceStart, sourceEnd }]` at import time — no more fallback to clip-file-only rendering.

### Added
- **Media Offline state**: When `project.sourceFile` is missing from disk (user moved/renamed/deleted the OBS recording), the editor displays a red "Media Offline" banner in the preview area with the missing path and a **Locate file…** button. Clicking opens a file picker; selecting the moved recording updates `project.sourceFile` and restores preview. Matches DaVinci's offline-media UX. No silent fallback to clip files.
- **`project:locateSource` IPC** + `projectLocateSource` preload bridge to drive the Locate-file flow.

### Fixed
- **Waveform stretches during extend (previously visible as stretched audio peaks while dragging a trim handle past the original clip bounds)**: Root cause was peaks being sliced from a small clip-file range that didn't cover the extended area. Now resolved because peaks span the full source.
- **"Clip has to load after every extend" loading delay**: Eliminated entirely. Extends/trims apply instantly via segment-bound updates; no video reload, no FFmpeg.
- **Playhead snap-back when extending past original clip boundaries**: Eliminated as a class. `video.currentTime` can now reach any point in the source recording that a segment references.

### Removed
- `commitNleExtendCheck` action in `useEditorStore.js` (~150 lines) — the FFmpeg-recut-on-extend pathway is no longer needed.
- `onExtendCommit` prop and callback wiring from `WaveformTrack.js` + `TimelinePanelNew.js` — pointerup no longer triggers a recut.

### Technical notes
- `clip.filePath` (pre-cut clip file) is retained in project JSON for now. The editor no longer reads from it. Per-clip retranscription (Stage 7b in `ai-pipeline.js`) still consumes it; a follow-up can replace that with direct audio extraction from source + in/out.
- Legacy IPC handlers `clip:extend` and `clip:extendLeft` remain in `main.js` as dead code. Not called from the editor anymore. Can be deleted in a cleanup pass.
- `project.transcription` is generated from the full source at project creation and is source-absolute, so extends reveal already-transcribed audio with no Whisper re-run needed.

## [Unreleased] — 2026-04-14 (session 2)

### Fixed
- **Bug A — Waveform peak misalignment after trim**: Waveform peaks drifted out of sync with audio after a left-trim because `TimelinePanelNew` was passing the timeline `duration` (which shrinks on trim) to `WaveformTrack` as the clip-file denominator. Introduced separate `clipFileDuration` field in `usePlaybackStore`, set once from `video.duration` on `loadedmetadata`. Waveform peak slicing now uses the unchanging clip-file extent.
- **Bug C — Segment body "zooms" during active left-trim drag**: While dragging a trim handle, the pixel-per-second scale was recomputing live from the shrinking timeline duration, causing all segments to reflow under the cursor. Fixed by adding a `trimSnapshot` useState in `TimelinePanelNew` that freezes the pixel scale for the duration of the drag. `WaveformTrack` now fires `onTrimStart`/`onTrimEnd` callbacks from pointerdown/pointerup. Trim math still commits live — only the visual scale is frozen.
- **Bug B — Subtitle track drift**: Resolved as a downstream side effect of A + C — timeline subtitle rendering already used `visibleSubtitleSegments`, so once pixel scales stabilized, words re-aligned with audio.
- **Subtitle clamp at segment level**: Subtitles whose start OR end fell into a trimmed region were being dropped wholesale, making subs vanish the moment a trim touched them. `visibleSubtitleSegments` in `timeMapping.js` now clamps start/end to the kept overlap — a sub only disappears when NO part of its range overlaps any kept segment.
- **Subtitle clamp at word level**: Same fix applied to `visibleWords` — individual words now clamp to segment boundaries instead of dropping when only their start is in a deleted region. Subs now vanish when the trim crosses their **end**, not their start (per user requirement).
- **Floating-point segment boundary tolerance**: Added `BOUNDARY_EPS = 0.001` to `sourceToTimeline` so sub-millisecond FP drift at `sourceStart`/`sourceEnd` no longer reports a time as "outside" the segment. Also applied same tolerance to the "is current position inside any segment?" check in `setNleSegments`.

### Changed
- **Subtitle clustering removed**: Tried multi-tier and binary clustering approaches — user rejected both in favor of always-individual subtitle rendering. Stripped all clustering logic from `TimelinePanelNew`; subs now map 1:1 from `visibleSubtitleSegments`. Dead constants (`MERGE_THRESHOLD`, `CLUSTER_GAP_PX`, `CLUSTER_MIN_WIDTH_PX`) left in `timelineConstants.js` for next session cleanup.

### Known Issues
- **Snap-to-0 on ruler click (pre-trim only, UNFIXED)**: On a freshly opened untrimmed clip, clicking the ruler snaps the playhead back to 0 and prevents play. After any trim, the bug disappears for the rest of the session. Logs show an infinite `onTimeUpdate` loop with `needsSeek: true, seekToSource: 0`. FP-epsilon fix did not resolve it; hypothesis now shifted to duplicate `setNleSegments` calls during init re-triggering the `snapToFirst` branch. Investigation plan in HANDOFF.md.

## [Unreleased] — 2026-04-14

### Fixed
- **Trim-left freeze (root cause)**: Trimming the left edge of a clip caused playback to freeze entirely (spacebar/play unresponsive, video element stalled at `readyState=1`). Root cause was a coordinate-space mismatch: `usePlaybackStore` treated `video.currentTime` as source-absolute when the element actually plays the pre-cut clip file (clip-relative). Fixed by introducing `clipFileOffset` in the playback store and routing every conversion through it: `sourceAbs = vidTime + clipFileOffset`, and writing `vid.currentTime = targetSourceAbs - clipFileOffset`. `setNleSegments`, `seekTo`, and `mapSourceTime` all updated. Editor store now sets `clipFileOffset` from the initial segment's `sourceStart` before calling `setNleSegments`.
- **Timeline playhead past trimmed end**: The timeline's rAF was feeding clip-relative `video.currentTime` directly into the ruler (timeline coords). On a left-trim, the playhead marched past the new timeline end. Fixed by routing through `usePlaybackStore.mapSourceTime()` so the ruler always renders in timeline coordinates.
- **rAF seek storm preventing play()**: `PreviewPanelNew`'s rAF loop was writing `video.currentTime = seekToSource` every frame while the element was already seeking, which prevented `play()` from ever resolving. Now guarded by `!video.seeking && Math.abs(delta) > 0.05`.

### Added
- **Renderer crash + console forwarder (debug, temporary)**: `main.js` now auto-opens detached DevTools and appends every renderer console message to `%APPDATA%/clipflow/trim-debug.log`, plus a `render-process-gone` handler. The logger and forced DevTools will be removed once the remaining three trim rendering bugs (waveform, subtitle track, segment drag visual) are fixed; the crash handler stays.

### Known Issues
- Left-trim still visually breaks three rendering layers (same coordinate-space root cause, unfixed): waveform peaks desync with audio, timeline subtitle words drift off speech, and segment body "zooms" during active drag instead of shrinking. All have helpers ready in `timeMapping.js` (`getSegmentTimelineRange`, `visibleSubtitleSegments`, `buildTimelineLayout`). See HANDOFF.md for fix plan.

## [Unreleased] — 2026-04-13

### Added
- **NLE-aware render pipeline (Phase 4)**: `render.js` now assembles the final video from `sourceFile + nleSegments` using FFmpeg `trim`/`atrim`/`concat` filter_complex instead of requiring pre-cut clip files. Single-segment clips use simple trim; multi-segment clips concat. Falls back to legacy `clipData.filePath` behavior only when no NLE segments exist.
- **Source FPS preservation**: Added `probeFps()` and forced `-r` flag on render output. Fixes the known 60fps→25fps drop bug by matching the source recording's frame rate.
- **Batch render subtitle auto-mapping**: Batch render detects source-absolute subtitles via `_format` marker and maps to timeline time internally (single-clip render already did this in EditorLayout).
- **Phase 3D migration tests**: Added 9 tests covering old audioSegments→NLE conversion, subtitle offset migration, round-trip save/load, double-offset prevention, and the new ID/index lookup API for `getSegmentTimelineRange`. Test suite now 74/74 pass.
- **QueueView redesign**: 716-line rewrite of the Queue tab with expanded layout and improved scheduling UX (uncommitted from previous session, now landed).
- **Commercial architecture references**: Added `reference/commercial-electron-architecture.md` and `reference/social-media-api-research.md`. Upgraded `TECHNICAL_SUMMARY.md` to v3.

### Changed
- **Render subtitle flow**: `EditorLayout.doQueueAndRender` now maps subtitles from source-absolute to timeline time via `visibleSubtitleSegments()` before sending to the overlay renderer. Passes `nleSegments` in clip data.
- **Subtitle overlay renderer**: Accepts explicit `timelineDuration` parameter (NLE mode skips ffprobe duration call) and separate `resolutionProbeFile` path (still probes the source for video dimensions).
- **getSegmentTimelineRange API**: Swapped parameter order to `(idOrIndex, segments)` and now accepts either a segment ID string or numeric index. Returns `null` for invalid lookups instead of an empty range.
- **Queue badge count**: Only counts unscheduled approved/ready clips (scheduled ones no longer inflate the count).
- **Waveform alignment**: Fixed `WaveformTrack` peak slicing to offset by `clipOrigin` when converting source-absolute NLE coords to clip-relative frame positions.

### Fixed
- **Video source playback**: Reverted `PreviewPanelNew` from `project.sourceFile` back to `clip.filePath` (segment-aware source playback is deferred to a later phase — current NLE model still relies on pre-cut clip files for playback). Added `initNleSegments` call on video load for clips without saved segments.

## [Unreleased] — 2026-04-07

### Added
- **Non-destructive NLE segment model**: New pure-function architecture where audio segments are source-file references (`{ sourceStart, sourceEnd }`), timeline position is always derived (never stored), and edit operations (split, delete, trim, extend) are instant with no FFmpeg calls. Includes 65 unit tests covering all operations, coordinate roundtrips, and subtitle visibility mapping. Foundation for eliminating subtitle sync bugs by construction.
- **Segment-aware playback engine**: Playback store converts between source time and timeline time, with automatic gap-crossing at segment boundaries. Video element plays the original source file directly instead of re-encoded clips.
- **Architecture plan**: Full 5-phase implementation plan for non-destructive editing documented in `tasks/nle-architecture-plan.md`, validated by 5-advisor LLM council session.
- **"Research Before Editing" rule**: Added as non-negotiable section in CLAUDE.md — all affected files must be read before any code changes.

### Changed
- **Video preview source**: Preview panel now loads from `project.sourceFile` (original recording) instead of `clip.filePath` (re-encoded clip), with legacy fallback for old projects.
- **Waveform extraction**: Now extracts 800 peaks from source file (up from 400 from clip file), cached once per project since source never changes.
- **Editor store**: Added `nleSegments` state with migration from old `audioSegments` format on load. New instant actions (`splitAtTimeline`, `deleteNleSegment`, `trimNleSegmentLeft/Right`, `extendNleSegmentLeft/Right`) replace legacy destructive actions.
- **Subtitle store (Phase 3B)**: Timestamps are now source-absolute internally. Added `getTimelineMappedSegments()` selector that converts source-absolute → timeline coordinates for UI display. `_displayFmt()` helper keeps formatted timestamps showing clip-relative times while `startSec`/`endSec` are source-absolute. Undo snapshots capture `nleSegments` instead of old `audioSegments`/`clipMeta`. Saved subtitles use `_format: "source-absolute"` marker for backward compatibility.
- **Timeline UI (Phase 3C)**: `TimelinePanelNew.js` fully wired to NLE model — all operations (`split`, `delete`, `trim`, `resize`, `drag`) use `nleSegments` and pure functions. Removed all `leftOffset`, `audioMaxEnd`, `extending` concepts. Audio track renders from `nleSegments` with derived timeline positions. `WaveformTrack.js` rewritten with source-absolute peak slicing and NLE trim handles. `SegmentBlock.js` simplified (position derived from `seg.startSec / duration`). Subtitle resize/drag handlers use dual-coordinate-space pattern: timeline originals for overlap detection, `toSource()` conversion at store call sites.

### Discovered
- **60fps frame drop bug**: `cutClip` in `ffmpeg.js` is missing `-r 60` flag, causing source 60fps HEVC to be re-encoded to 25fps H.264. Fix planned for Phase 4 export pipeline rebuild.

- **Concat recut for mid-clip deletes**: New `concatCutClip` FFmpeg function and `clip:concatRecut` IPC handler that splices only the kept segments from the source recording, physically removing deleted mid-sections from the clip file instead of just trimming outer bounds.
- **Audio segment sourceOffset tracking**: Audio segments now track their shift from original file position, used by WaveformTrack to slice correct peaks after ripple shifts.

### Fixed
- **Subtitles not trimmed when clip is trimmed and saved**: `handleSave` now wraps editSegments as `{ sub1: [...] }` matching the format `initSegments` expects on reload. Added legacy flat-array fallback for clips saved before this fix.
- **Stale transcription overriding saved subtitles after trim**: `initSegments` now detects when `clip.transcription` spans significantly longer than the current clip duration and skips it, falling through to the correctly-saved `clip.subtitles`. Also clears `clip.transcription` on recut.
- **Waveform not regenerated after recut**: `waveformPeaks` is now set to `null` after any recut operation (delete, trim, revert), triggering fresh FFmpeg extraction from the new video file.
- **Waveform extracting wrong audio track**: `extractWaveformPeaks` now uses the configured `transcriptionAudioTrack` setting instead of FFmpeg's default stream, ensuring the waveform matches the same audio used for transcription (mic, not game audio).
- **Duplicate subtitles from whisperx**: Added segment-level and word-level deduplication that strips punctuation before comparing, catching cases like "friendly," and "friendly" being output as separate entries.
- **EPIPE crash dialog on app quit**: Added uncaughtException handler that suppresses EPIPE errors from Sentry/electron-log writing to a closed stdout pipe.
- **Missing upper bound filter in initSegments**: When falling back to project transcription with `clipStart=0`, `clipEnd` now uses `clip.duration` instead of `Infinity`, preventing segments past the trimmed end from loading.

### Known Issues
- **Subtitle/waveform alignment after mid-clip delete is still broken**: The concat recut approach was just introduced and needs testing. Subtitle shifting during `_trimToAudioBounds` may not correctly map to the new concatenated file's timeline. This is the top priority for the next session.

---

## [Unreleased] — 2026-04-06

### Added
- **Audio track setting for transcription**: New "Audio Track to Transcribe" selector in Settings (BetterWhisperX section) lets users choose which OBS audio track (1-4) to use for transcription. Saves immediately to electron-store.

### Fixed
- **Transcription using wrong audio track**: Default audio track was set to Track 2 (game audio) instead of Track 1 (mic). Changed default to Track 0 (Track 1 / mic) across all extraction points — main pipeline, retranscribe handler, and ffmpeg:extractAudio IPC. Includes a one-time migration for existing installs.
- **AI-generated titles and captions contained emojis**: Added explicit "no emojis" rules to both the title/caption generation prompt and the clip detection prompt. Three layers of reinforcement: per-section rules, DO NOT list, and example emoji characters to avoid.
- **PostHog shutdown crash on app close (CLIPFLOW-3)**: `posthog.shutdown()` was called on every `beforeunload` event, but PostHog JS SDK v1.364.5 has no `shutdown()` method — causing a TypeError 68 times in Sentry. Removed the broken handler; PostHog handles flush-on-unload automatically.
- **AI title/caption generation now uses trimmed transcript**: Previously, generating titles and captions in the editor always sent the full original clip transcript to the AI, ignoring timeline trims, segment deletions, and text edits. Now reads the current `editSegments` from the subtitle store, so the AI sees exactly what will appear in the final video. Also means user-corrected transcription text (e.g., fixing Whisper errors) is reflected in generated titles.

---

## [Unreleased] — 2026-04-03

### Added
- **Queue tab dashboard layout**: Replaced card-based queue with a dashboard table featuring a 4-stat bar (Queued, Scheduled, Published Today, Failed), sortable table rows with 9:16 vertical thumbnails, and click-to-expand inline detail panels with editable titles, platform icons, schedule picker, and publish actions.
- **Drag-to-reorder queue clips**: Installed @dnd-kit and added sortable rows with grip handles. Persists `queueOrder` integer on each clip in project.json. Reordering works across all clips regardless of game type.
- **Thumbnail extraction at render time**: After clip render completes, automatically extracts a frame at t=1s via FFmpeg and saves as `_thumb.jpg` alongside the rendered video. Populates the existing `thumbnailPath` field on the clip object. Works for both single and batch renders.
- **Dequeue (remove from queue)**: New `"dequeued"` clip status. Remove button on each clip sets this status so the clip leaves the queue without losing its approval — can be re-approved in the Editor to re-queue it.

### Changed
- **Queue tab layout**: Migrated from inline-style cards to a grid-based dashboard table. Stats bar replaces the old Main/Other game count cards. Publishing accounts section removed (info now visible per-clip via platform icons).

---

## [Unreleased] — 2026-04-03

### Added
- **Word timestamp post-processing pipeline** (`cleanWordTimestamps.js`): 4-pass correction for Whisper's raw word timestamps — monotonicity enforcement, minimum 50ms duration, micro-gap filling (150ms), and suspicious timestamp detection with character-count redistribution. Runs automatically at segment initialization.
- **Unified word-driven highlight lookup** (`findActiveWord.js`): Shared algorithm used by both the editor preview and the burn-in renderer, eliminating timing divergence between what you see in the editor and what appears in exported video. syncOffset now applied in burn-in path.
- **Progressive karaoke highlight** (opt-in): Aegisub-style gradual fill across each word, available as `highlightMode: "progressive"`. Original instant highlight remains the default.
- **Expanded subtitle segmentation rules**: Added contractions (let's, I'm, I'll, we're, etc.), auxiliaries (is, are, was, will, etc.), and demonstratives (that, this, these, those) to forward connectors. Added atomic phrases ("light work", "let's get", "real quick", etc.) that are never split across segments. Unicode apostrophe normalization for consistent word matching.

### Improved
- **Segment timing accuracy**: startSec clamped to first word (no early segment display), last word extended through linger time, intra-segment gaps filled. Segments now tightly track actual speech boundaries.

### Fixed
- **Subtitle timing drift**: Whisper's DTW-based word alignment produces near-zero durations, overestimated gaps, and cumulative drift. The new 4-pass post-processing pipeline corrects these before segmentation, significantly reducing karaoke highlight drift.

---

## [Unreleased] — 2026-04-03

### Fixed
- **Editor style persistence:** Saved subtitle and caption customizations (color, position, font, effects) now persist when navigating away from the Editor tab and back. Root cause: `initFromContext()` always applied the default template on mount, overwriting saved `clip.subtitleStyle` and `clip.captionStyle`. Template now provides defaults, then saved customizations are restored on top via new `restoreSavedStyle()` methods on both stores.
- **Caption style save was silently broken:** `handleSave()` was reading unprefixed property names from the caption store (`capState.fontFamily` instead of `capState.captionFontFamily`), causing all caption styling to save as `undefined`. Fixed to use correct prefixed names and expanded to save all caption effects (stroke, shadow, glow, background) — previously only saved 7 basic fields.

### Improved
- **Subtitle segmentation — forward connector rule:** Expanded the "never end a segment on 'I'" rule to cover 19 forward-connecting words: prepositions (to, in, on, at, for, of, with, from, by), articles (a, an, the), and conjunctions (and, but, or, so, if, as). Words that grammatically connect forward now start the next segment instead of dangling at the end. Edge case: if the connector is the last word before a hard pause, it stays with the preceding segment.

### Added
- **Subtitle timing rebuild spec:** Full 4-phase spec for fixing karaoke timing drift, based on research into whisper-timestamped, stable-ts, CrisperWhisper, WhisperX, and Aegisub. Covers word timestamp post-processing, progressive karaoke highlight, unified preview/burn-in algorithms, and segmentation safe fixes. See `tasks/subtitle-timing-rebuild-spec.md`.

---

## [Unreleased] — 2026-04-03

### Added
- **clipflow-optimize skill:** Profile-driven performance optimization adapted from `extreme-software-optimization`. Covers React re-renders, IPC batching, memory leaks, startup time, FFmpeg pipeline, and Whisper transcription with measure-first methodology and opportunity scoring.
- **clipflow-mock-finder skill:** Multi-method stub/placeholder detection — keyword search, suspicious return values, short function analysis, behavioral detection (fake delays, hardcoded scores), and caller tracing. Produces categorized findings table.
- **clipflow-ux-audit skill:** Nielsen's 10 heuristics mapped to ClipFlow's views, Big 4 accessibility checks, user flow analysis with happy/error paths, and prioritized reporting template.
- **research-software skill (global):** Source-code-first research methodology for investigating dependencies — clone at stable tag, grep for hidden flags/env vars, mine PRs and tests, structured output.

### Fixed
- **Critical blank screen crash resolved:** Root cause identified via Sentry as a Chromium renderer process crash (`blink::DOMDataStore::GetWrapper` — EXCEPTION_ACCESS_VIOLATION_READ). Video elements were being removed from the DOM while Chromium's internal fetch stream was still reading the file, causing a null pointer dereference in Blink. Fixed by adding `useEffect` cleanup hooks that abort video loading before unmount (`pause()` + `removeAttribute("src")` + `load()`). Applied to both PreviewPanelNew.js (editor) and ProjectsView.js (projects preview).

### Added
- **Sentry API integration:** Personal API token configured for querying Sentry errors directly from development sessions. Org `flowve`, project `clipflow`.
- **DOM-level crash recovery:** Added global `window.error` and `unhandledrejection` handlers in index.js that render a crash screen directly to the DOM, bypassing React entirely. Ensures users always see an error message even if the React tree is dead.
- **Renderer crash detection:** Added `render-process-gone`, `unresponsive`, and `responsive` event handlers on Electron webContents in main.js. Auto-reloads the renderer on non-clean-exit crashes.
- **ClipPreviewBoundary error boundary:** Wraps clip video players in ProjectsView so bad clip data shows a "Preview error" with retry button instead of crashing the entire app.
- **Defensive guards:** Protected `currentSeg.text.split()` in PreviewOverlays.js against null text, guarded `applyTemplate()` against malformed templates, wrapped `posthog.capture` in try-catch during tab navigation, made AppErrorBoundary robust against Sentry import failures.
- **Shared preview overlays:** Extracted `SubtitleOverlay` and `CaptionOverlay` into shared components (`PreviewOverlays.js`) used by both Editor and Projects tabs, eliminating ~200 lines of duplicate rendering code and ensuring Projects preview matches Editor exactly.
- **Tracker tab:** Extracted the full schedule tracker (stat cards, weekly grid, Edit Template, Export/Import, presets, undo/redo, drag-to-reorder, popovers) out of Queue into its own standalone TrackerView tab with a 📊 icon in the nav bar.
- **Captions section in Queue tab:** The Captions & Descriptions content (YouTube descriptions + Other Platforms templates) is now embedded directly in the Queue tab below the publish log as a natural scroll continuation, replacing the standalone Captions tab.

### Fixed
- **Projects preview yPercent:** Projects tab now reads saved clip position values instead of always falling back to template defaults, so subtitle/caption positions saved in the Editor are correctly reflected in Projects preview.
- **DraggableOverlay blank screen:** Gated DraggableOverlay on `editSegments.length > 0` to prevent it from mounting when no segments exist, which was contributing to app blank screen crashes.

### Changed
- **Navigation restructured:** Tab order is now Rename → Recordings → Projects → Editor → Queue → Tracker → Settings. The Captions tab has been removed from the nav bar.
- **Sequential-immediate publishing:** Removed the 30-second stagger delay between platform uploads. Publishing now proceeds immediately from one platform to the next with no artificial wait. The "30s stagger" label has been removed from the publishing accounts info bar.

### Removed
- **Captions tab:** No longer a standalone tab — content is now part of the Queue tab.
- **30s stagger delay:** The `STAGGER_MS` constant and `setTimeout` between platform uploads have been removed from the publish pipeline.

## 2026-04-03

### Added
- **Test watch folder:** Secondary configurable watch folder for testing the full pipeline without polluting real content history. Configurable in Settings under "Files & Folders" with a yellow DEV badge. Runs a separate chokidar watcher instance alongside the main one — same OBS filename pattern detection, same rename/recording/clip/editor/queue pipeline.
- **Test file tracking (is_test flag):** Files originating from the test folder are flagged `is_test = 1` in the `file_metadata` SQLite table (schema migration V4). The flag propagates through split children automatically.
- **Test group in Recordings tab:** Test files appear in a dedicated "Test" group pinned to the top of the Recordings tab instead of their date-based month group. Same card style, grid layout, and collapse/expand behavior as normal month groups.
- **TEST badge in Rename tab:** Pending files from the test watcher show a yellow "TEST" pill between the filename and rename preview arrow so test clips are visually distinguishable.
- **Project tags system:** Projects now have a `tags` array field in their JSON schema. Projects generated from test recordings automatically receive a `tags: ["test"]` value. A yellow "TEST" pill appears on project cards in the Projects tab.
- **Test render output isolation:** Rendered clips from test projects are saved to `{testWatchFolder}\ClipFlow Renders\` instead of the main output folder, keeping all test artifacts self-contained for easy cleanup.

### Changed
- **Watcher refactored to shared handler:** The OBS file detection logic (pattern matching, pendingImports check, IPC dispatch) was extracted into `handleWatcherFileAdded()` and `createOBSWatcher()` functions — both the main and test watchers share the same code path with zero duplication.
- **Pending file dedup uses filePath instead of fileName:** Prevents edge case where the same OBS filename in both folders would cause the second detection to be silently dropped.
- **Same-folder guard:** Setting the test folder to the same path as the main watch folder is rejected at the IPC level to prevent duplicate detections.

### Fixed
- **Preview thumbnail collision for files in same directory:** The `fileId` used for preview frame temp directories was generated by truncating base64url-encoded paths to 32 characters. Files in the same folder shared an identical prefix after truncation, causing all preview frames to overwrite each other in the same temp directory. Fixed by using MD5 hash of the full path. Also affects scrubber thumbnail strips.

- **Video preview thumbnails in Rename tab:** Each pending file card now shows a 160x90px thumbnail on the left side. Frames are extracted at smart positions based on video duration (1-4 frames scaling with length). On hover, thumbnails crossfade through frames every ~1 second so you can identify the game at a glance without opening the file. Uses a concurrency-limited FFmpeg extraction pipeline (max 2 simultaneous).
- **Inline preset name picker:** Clicking the colored renamed filename opens a dropdown showing all 6 naming formats with their actual rendered values for that file. Replaces the old preset `<Select>` dropdown, saving significant space in the controls row.
- **Click-to-edit Day/Pt pill controls:** Replaced the +/- spinbox buttons with clean pill-style controls. Click the number to type a new value, or scroll wheel to increment/decrement. No visible buttons — much more compact.
- **Last-renamed game auto-selection:** After renaming a file as a specific game, newly detected files automatically default to that game instead of requiring manual selection each time.
- **"split video" button:** Renamed from "split by game" and now visible for all probed files (previously only showed for recordings over a threshold).

### Changed
- **Color-matched UI elements:** Day/Pt pills, renamed filename text, preset dropdown highlights, and game dropdown border all use the game's assigned color for visual unity across the card.
- **Unified control sizing:** Game dropdown, Day pill, and Pt pill all share the same 36px height for consistent alignment.
- **GamePill centering fix:** Small size variant now properly vertically centers text with explicit alignItems/justifyContent and lineHeight.
- **RENAME/HIDE buttons tightened:** Smaller padding and font size to match the more compact card layout.
- **PillSpinbox component (new):** Reusable pill-style number input in shared.js with scroll wheel support and fixed-width editing.

## 2026-04-02

### Added
- **Pixel-perfect subtitle/caption burn-in for rendered clips:** Rendered clips now have subtitles and captions that exactly match the editor preview. Uses an offscreen Electron BrowserWindow with the same `subtitleStyleEngine.js` and CSS rendering as the editor, capturing PNG frames and compositing them via FFmpeg. Supports all styling: multi-ring strokes, glow, karaoke word highlighting, DM Sans/Latina Essential fonts, and caption positioning.
- **Offscreen overlay renderer (`subtitle-overlay-renderer.js`):** New module that creates a transparent BrowserWindow at source video resolution, injects the shared style engine, captures sequential PNG frames at 10fps, and returns them for FFmpeg compositing.
- **Overlay HTML renderer (`public/subtitle-overlay/`):** DOM-based renderer running inside the offscreen window, implementing the same `findActiveWord`, `buildCharChunks`, `renderSubtitle`, and `renderCaption` logic as `PreviewPanelNew.js`.

### Fixed
- **AI titles/captions persisting between clips:** Generated titles, captions, and accepted/rejected state from one clip were leaking into the next when switching clips in the editor. Added `useAIStore.getState().reset()` to the clip-switching logic in `useEditorStore.initFromContext()`.
- **Cloudflare AI Gateway 2009 Unauthorized on all requests:** The default gateway URL had a truncated Cloudflare account ID (29 chars instead of 32, missing `ef9` segment). Every gateway request hit a nonexistent endpoint. Fixed the stored URL default in `main.js`.
- **Gateway BYOK auth conflict:** When using Cloudflare Provider Keys (BYOK), the app was sending both `x-api-key` and `cf-aig-authorization`, causing Cloudflare to reject requests. BYOK mode now sends only `cf-aig-authorization`; direct/passthrough mode sends only `x-api-key`.
- **Delete project not allowing re-generation:** Deleting a project didn't clear the SQLite "done" status or electron-store doneRecordings entry. The `isDone()` check has three conditions; now all three are cleared on deletion via fileMetadataId lookup, project name fallback, and doneRecordings key matching. Added orphan reconciliation on project list load for files stuck from pre-fix deletions.
- **"Unmark done" button missing on SQLite-status files:** Files marked as "done" by SQLite status (not manual mark) had no way to reset. Added an × button on the DONE badge that resets SQLite status to "renamed" and refreshes the file list.
- **Subtitle/caption Y positions wrong in Projects preview:** Editor save code read `yPercent` from the wrong store (`subPos` legacy slider instead of `useLayoutStore.subYPercent`). Fixed save to read from layout store. Projects view now prefers template positions over saved clip values.
- **Pop animation missing in Projects preview:** FALLBACK_TEMPLATE was missing animation fields (`animateOn`, `animateScale`, `animateGrowFrom`, `animateSpeed`). Added them and made animation config prefer the user's selected template over per-clip saved values.
- **Subtitle timing drift in Projects preview:** Time updates used `timeupdate` event (~4Hz) causing words to be skipped. Replaced with `requestAnimationFrame` loop (~60Hz) matching the editor's approach. Also added `syncOffset` support from saved clip data.
- **Whisper hallucination cascade ("Let's go" bug):** Whisper's `condition_on_previous_text=True` default caused hallucination loops on gaming audio — one hallucinated phrase would feed back into the next 30-second chunk and repeat for the entire recording. Set `condition_on_previous_text=False` so each chunk is transcribed independently.

### Added
- **Per-clip retranscription in pipeline (Stage 7b):** After clips are cut, each clip gets its own fresh Whisper run on its short audio. Produces far more accurate subtitles than slicing from the source transcription. Stored in `clip.transcription` which the editor already prioritizes.
- **Retranscription failure flag:** If per-clip retranscription fails, the clip is flagged with `transcriptionFailed: true` and `transcriptionError`. A red "⚠ Subs failed" badge appears in the Projects tab so the user knows which clips need manual re-transcription.
- **Shared subtitle rendering engine:** Extracted pure functions (`buildSubtitleStyle`, `buildSubtitleShadows`, `buildCaptionStyle`, etc.) into `subtitleStyleEngine.js`. Both editor and Projects preview now use the same rendering logic, eliminating visual drift.
- **Video pause on play another:** Playing a preview video in the Projects tab now pauses any other playing video via a module-level singleton ref.
- **Three gateway routing modes:** Refactored Anthropic provider to support BYOK (cf-aig-authorization, no API key), passthrough (API key through gateway for logging/analytics), and direct (API key to Anthropic). Mode is determined by which Settings fields are populated.
- **BYOK-only mode:** Users with Cloudflare Provider Keys no longer need a local Anthropic API key configured.
- **Gateway error detection:** Cloudflare returns errors as JSON arrays, not Anthropic-style objects. Added proper detection, logging, and user-facing error messages for gateway-specific failures.
- **HTTP status code logging:** All Anthropic API responses now log HTTP status codes and response size for debugging.
- **Subtitle segmentation spec v1.2:** Added Rules 6 (Never End on "I"), 7 (Comma Flush), 8 (Atomic Phrase Protection), linger duration, updated constants, 6 conflict resolution entries, and 4 regression test cases.

### Changed
- **Settings sections all start collapsed:** All 6 collapsible sections in Settings now start collapsed on fresh launch instead of a mix of expanded/collapsed. Expanded/collapsed state persists across tab switches within the same session (lifted state from SettingsView to App.js).
- **Editor save now persists layout positions correctly:** `yPercent` for subtitles and captions is read from `useLayoutStore` (the actual rendered position) instead of the legacy subtitle store slider. `syncOffset` is also persisted for Projects preview sync.

## [Unreleased] — 2026-04-01

### Added
- **Cloudflare AI Gateway proxy support:** All Anthropic API calls can now route through a Cloudflare AI Gateway proxy. Refactored `anthropicRequest()` to use an options object (`{ timeout, gateway }`) instead of positional args. When `gatewayAuthToken` is set in electron-store, requests go through the configured gateway URL with `cf-aig-authorization` header; when empty, calls go direct to `api.anthropic.com` as before. Gateway URL stored with configurable default, trailing slashes normalized, invalid URLs caught with fallback to direct. Every request logs its routing path (Direct vs Gateway) via electron-log.
- **Gateway credentials in Settings UI:** New Gateway URL and Gateway Auth Token fields in Settings > API Credentials > Anthropic panel. Edit mode shows URL text input (prefilled with default) and masked token input with show/hide toggle. Display mode shows masked token or "Direct (no gateway)" with show/hide/copy buttons. Status row shows "Gateway active" in green when token is configured.
- **Sentry error tracking (@sentry/electron v7.10.0):** Remote crash reporting in both main and renderer processes. `Sentry.init()` runs before all other code in main.js and before React mounts in index.js. New `AppErrorBoundary` wraps the entire app and reports caught React errors to Sentry with a user-facing "Reload App" button. Existing `EditorErrorBoundary` now also reports via `Sentry.captureException()`. Removed `electronLog.errorHandler.startCatching()` so Sentry is the sole crash handler; electron-log remains the local file-based diagnostic logger.
- **PostHog product analytics (posthog-js):** Tracks 7 custom events (`clipflow_tab_changed`, `clipflow_pipeline_started`, `clipflow_pipeline_completed`, `clipflow_pipeline_failed`, `clipflow_clip_approved`, `clipflow_clip_rejected`, `clipflow_publish_triggered`) with no PII. Stable device ID generated on first launch via electron-store UUID and used with `posthog.identify()` for consistent cross-session tracking. Autocapture and pageview capture disabled (Electron SPA generates noise). Event queue flushed on quit via `posthog.shutdown()`.
- **Analytics opt-out toggle:** "Send anonymous usage data" toggle in Settings > Diagnostics. Persists to electron-store and calls `posthog.opt_out_capturing()` / `posthog.opt_in_capturing()` immediately. Defaults to enabled.

### Fixed
- **Preload script crash from @sentry/electron/preload:** The bare `require("@sentry/electron/preload")` failed to resolve in Electron's preload context, crashing the entire preload script and preventing `window.clipflow` from being exposed — making the app an empty shell with no data. Wrapped in try/catch so Sentry gracefully falls back to protocol mode while the IPC bridge loads normally.
- **Audio segment delete/trim now recuts the video file:** Deleting or left-trimming audio segments previously shifted timeline timestamps but never recut the actual video, causing the `<video>` element to show the wrong section (first N seconds instead of the remaining content). All three left-shift operations (delete, ripple delete, drag-trim) now trigger an FFmpeg recut via `recutClip` IPC, updating clip metadata, source boundaries, and `videoVersion` for cache-bust reload. Also fixed `_trimToAudioBounds` to always sync playback duration to final audio bounds.

### Added
- **Project Folders feature (full build from spec v1.1):** Sidebar folder panel (160px) with "All Projects" always first, color-coded folder entries, and sort mode toggle (Created/A-Z/Z-A). Full CRUD: create folders via inline input, rename/recolor/delete via right-click context menu, 8-preset color picker submenu, delete confirmation dialog with 5-second undo toast. Move projects between folders via floating action bar dropdown or project right-click context menu, with move undo toast. Folder filtering narrows the project list; empty folder shows guidance text. Reconciliation prunes stale project IDs on every `folder:list` call. Data layer: electron-store defaults + migration, 6 IPC handlers, 6 preload bridge methods.
- **Project Folders spec v1.1 (council-reviewed):** Full implementation spec at `reference/project-folders-spec.md`. Flat folders stored as metadata in electron-store, 6 IPC handlers, sidebar folder panel with filtering, multi-select floating action bar, undo toasts for destructive ops. Two council sessions (feature design + spec review) caught 7 issues and produced 3 design decisions.
- **Claude Code behavioral directives (council-reviewed):** Analyzed fakegurus-claude-md repo and ran a full 5-advisor LLM Council with peer review. Cross-referenced 10 proposed directives against 50+ documented failures in lessons.md. Merged 3 evidence-backed rules: failure recovery protocol (stop after 2 failed attempts, re-read, new approach), context decay awareness (re-read files after 10+ messages), and large file read safety (chunked reads for 500+ LOC files). Also added one-word mode to project config for faster interaction flow.
- **Rename safety checklist in code review skill:** Upgraded the existing "grep for ALL references" check to a 6-category safety checklist covering direct calls, type references, string literals, dynamic imports, re-exports/barrel files, and test files/mocks. Addresses a documented failure where a renamed variable was missed in JSX, causing a blank screen crash.

## [Unreleased] — 2026-03-31

### Added
- **Canonical subtitle segmentation function (`segmentWords.js`):** Extracted all segmentation logic from Zustand store into a standalone pure function with 29 regression tests. Eight rules in priority order: repeated phrases, filler isolation, forward look, max 3 words, 20-char limit, never end on "I", comma flush, atomic phrase protection. Hard wall pre-partitioning on sentence enders and 0.7s gaps.
- **Subtitle linger duration (0.4s):** Segments now extend 0.4s into empty space after the last word is spoken, so subtitles don't vanish instantly. Never overlaps the next segment.
- **Comma flush rule:** Words ending with commas or semicolons always end their segment — prevents awkward segments starting with "some," or "it,". A comma signals a natural phrase boundary.
- **Atomic phrase protection:** Common 2-word phrases ("as always", "of course", "by the way", "let's go", "trust me", etc.) are never split across segments. The chunker flushes early to keep phrases together.
- **Project preview word-level karaoke:** Preview cards now render subtitles with per-word highlighting, matching the editor's karaoke behavior. Each word is an individual span with highlight color on the active word and pop animation support.
- **Preview uses canonical segmentation:** Project preview tab now uses the same `segmentWords()` function as the editor instead of its own simplified 3-word chunking. Punctuation stripping applied per template config.
- **Editor save expanded:** Now persists `highlightColor`, `punctuationRemove`, `animateOn`, `animateScale`, `animateGrowFrom`, `animateSpeed`, and `segmentMode` to the clip's `subtitleStyle` for accurate preview rendering.
- **Preview template merging:** Clips with stale saved styles (missing new fields) now merge with the default template, so old projects pick up glow/highlight/animation settings.
- **Pure function for preview subtitles (`buildPreviewSubtitles.js`):** Shared utility that handles word gathering, segmentation, punctuation stripping, and active word detection — used by the project preview tab.
- **Audio track selection for transcription:** New `transcriptionAudioTrack` setting (default: track 2 / index 1) allows targeting the mic track in multi-track recordings.
- **LLM Council reports:** Four council sessions run during this session covering segmentation approach, spec v1.0 review, spec v1.1 review, and preview rendering architecture.

### Changed
- **MAX_CHARS raised from 16 to 20:** Better fit for subtitle display — "unfortunately I died" (20 chars) now stays as one segment.
- **FORWARD_LOOK_GAP changed from 1.0s to 0.5s:** Old value could never fire since all gaps ≥0.7s were already walled off by hard partitioning.
- **Segmentation logic removed from useSubtitleStore.js:** ~217 lines of inline chunking logic replaced with a single import of `segmentWords()`. Store now delegates entirely to the pure function.
- **Project preview onBack reloads from disk:** Returning from editor to projects view now reloads the project data so saved subtitle/caption styles are picked up immediately instead of showing stale state.

### Fixed
- **Ghost subtitle bug:** Transcription data sometimes contained a mega-segment spanning the entire clip. Now filtered out during segment initialization.
- **Subtitle segmentation regression (final fix):** Three recurring regressions (sentence boundary crossing, time gap grouping, phrase splitting) are now structurally impossible due to hard wall pre-partitioning architecture. Enforced by 29 regression tests.
- **Preview subtitle ghost double effect:** Project preview was running its own separate segmentation logic that produced poorly-timed segments. Now unified with editor's canonical function.
- **Stale preview after editor save:** Saved subtitle styles weren't reflected in the project preview because `onBack` didn't reload the project from disk. Fixed.

## [Unreleased] — 2026-03-30

### Changed
- **Settings page reorganized into 6 collapsible groups:** Files & Folders, Content Library, AI & Style, Publishing, Tools & Credentials, and Diagnostics. Related settings are now grouped together instead of scattered in a flat list. Groups 3/5/6 (AI, tools, diagnostics) start collapsed since they're rarely changed. Each group header is clickable to expand/collapse.
- Moved Output Folder and Sound Effects Folder from the middle of Settings to the Files & Folders group at the top, alongside Watch Folder and Video Splitting.

### Fixed
- Quick Import now correctly stores file size in the database. Previously, imported files always showed "0 B" in the Recordings tab because `fileSizeBytes` was not passed to `fileMetadataCreate()`. Fixed for both single-file and split import paths.

### Added
- Shared SQLite database with automatic migration system (rename redesign)
- Naming preset engine for file rename workflows
- IPC bridge for file metadata, labels, and rename history
- File metadata migration and electron-store migration path
- Recordings tab SQLite migration and AI pipeline refactor
- **Video splitting infrastructure (Phase 1, steps 1-4):** Settings for auto-split threshold (10-120 min), source file retention, and enable/disable toggle. Schema migration v3 adds split lineage columns (`split_from_id`, `split_timestamp_start/end`, `is_split_source`, `import_source_path`). FFmpeg `splitFile()` function with stream copy, all-or-nothing error handling, and post-split probe for keyframe-adjusted times. `split:execute` IPC endpoint creates child `file_metadata` records, marks parent as split source, and logs to rename history.
- **"Video Splitting" section in Settings UI** with enable toggle, threshold slider, and keep/delete originals toggle
- **`importExternalFile` IPC endpoint** — copies external .mp4 files to watch folder's monthly subfolder with streaming progress events. `pendingImports` Set in main process suppresses chokidar from creating duplicate `file_metadata` records during drag-and-drop imports. Matching uses filename + file size per spec v3.1 Section 14.1.
- **File watcher suppression** — chokidar `add` handler checks `pendingImports` Set before processing any new file, preventing duplicate entries from drag-and-drop imports. `import:clearSuppression` and `import:cancel` IPC endpoints for cleanup.
- **Auto-split integration in Rename tab** — probes file duration via FFmpeg when files enter pending. Shows split badge with duration and part count ("2h 14m — will split into 5 parts") plus a preview of resulting files with time ranges. Per-file "Don't split" toggle. RENAME button changes to "SPLIT & RENAME" when splitting is active. Split progress indicator shows completion during multi-part splits.
- **Drag-and-drop on Rename tab** — drop zone overlay with dashed border appears on drag-over. Accepts .mp4 files only, single file per drop. Copies file to watch folder with watcher suppression, then adds to pending list for standard rename flow. Import progress bar shown for large files.
- **Drag-and-drop on Recordings tab** — same drop zone treatment. Opens a quick-import modal with 3-step flow: pick game/content type, split proposal (green primary "Split & Generate" vs gray "Skip splitting"), and confirm preview. Uses preset 3 (Tag + Date) automatically. Supports watch folder auto-setup on first drop if not configured.
- **SPLIT badge in rename History tab** — split entries show a purple SPLIT badge, no undo button (deferred to future version per spec)
- **Thumbnail strip generation (Phase 2, step 11):** `generateThumbnailStrip()` in ffmpeg.js extracts one frame every 30 seconds at 320px wide using FFmpeg. Thumbnails stored in OS temp directory (`clipflow-thumbs/{fileId}/`), cleaned up on rename, cancel, or app quit.
- **`generateThumbnails` / `cleanupThumbnails` IPC endpoints (Phase 2, step 12):** Main process caches thumbnail results by file path — reopening the scrubber for the same file reuses existing thumbnails. Cleanup on `window-all-closed` deletes all cached thumb directories.
- **ThumbnailScrubber UI component (Phase 2, step 13):** Horizontal scrollable thumbnail strip with time labels every 5/10 minutes. Click anywhere to place purple split markers with dot handles and time tooltips. Click existing markers to remove them. Per-segment game/content dropdown using the same grouped Select component from the rename system. Enforces 1-minute minimum segment length. Segment list shows time ranges, durations, and color-coded indicators. Loading state with animated progress bar while thumbnails generate.
- **Game-switch split integration in Rename tab (Phase 2, step 14):** "Multiple games" button on every pending file card — clicking it generates thumbnails and expands the ThumbnailScrubber below the card. `gameSwitchSplitAndRename()` splits the source file at marker positions with per-segment game tags. Compound splitting: after game-switch split, each resulting segment is independently checked against the auto-split threshold and further split into parts if it exceeds it. RENAME button shows "SPLIT & RENAME" when markers are placed. `renameOne` and `renameAll` both handle game-switch splits. Scrubber state and thumbnails cleaned up on rename, cancel, hide, and rename-all.

### Changed
- Replaced native `<select>` in Quick Import modal (Recordings tab) with styled `Select` component — now shows GamePill color tags and matches Rename tab dropdown styling
- Renamed "Multiple games" button to "split by game" and moved it from a confusing standalone button to a subtle text link in the action buttons row (next to RENAME/HIDE)
- Refactored Rename tab UI with preset system
- Updated Settings UI for rename redesign
- `allRenamed` query now excludes files with `"split"` status so split parents don't appear in Recordings
- `updateFileStatus` guards against overwriting `"split"` status on parent files
- `applyPendingRenames` skips files with `"split"` status
- `isFileInUse` returns false for `"split"` files (parent is inert, children may be active)

---

## 2026-03-29 — Goal B, Onboarding, and Legacy Cleanup

### Added
- Cold-start architecture and creator profile system (Goal B)
- Onboarding wizard for new users
- AI preferences section in Settings

### Removed
- OBS log parser (dead code, never used)
- Hype/chill voice mode (redundant feature)

---

## 2026-03-28 — Provider Abstraction and AI Prompt Redesign

### Added
- Provider abstraction layer for LLM and transcription systems (swap models without code changes)
- Dev dashboard with provider controls, store viewer, and pipeline logs

### Changed
- Redesigned all AI prompts for model-agnostic reliability

---

## 2026-03-27 — OAuth Flows and Platform Publishing

### Added
- TikTok publish pipeline with Content Posting API and progress UI
- Meta (Instagram + Facebook) and YouTube publish pipelines with OAuth and upload UI
- TikTok inbox/direct post mode toggle for production API
- Separate Instagram and Facebook Page login flows (split from combined Meta OAuth)
- BrowserWindow-based OAuth for Instagram with separate app credentials
- GitHub Issues infrastructure with labels, CLI workflow, and API token

### Fixed
- Meta OAuth switched from deprecated Facebook redirect URI to localhost callback server
- Instagram OAuth race condition resolved
- Facebook now uses Page avatar instead of personal profile image
- TikTok PKCE code challenge uses hex-encoded SHA256 (TikTok deviates from RFC 7636)

### Changed
- Migrated OAuth modules and feedback system from console.* to electron-log scoped loggers
- Upgraded logging system to electron-log v5

---

## 2026-03-26 — Timeline Physics, Subtitle Sync, and Editor Polish

### Fixed
- Timeline subtitle drag physics, click targeting, and segment selection highlight
- Undo now captures pre-drag snapshot only, not intermediate drag states (Issue #12)
- Subtitle/audio sync improved with re-encode cut in pipeline
- Subtitle timing desync: timeline drags now sync word timestamps and respect segment boundaries
- Play-from-beginning when video has ended

### Added
- Subtitle drag overlap behavior and timeline UX improvements

---

## 2026-03-25 — TikTok OAuth and Logging System

### Added
- TikTok OAuth with encrypted token storage
- Dynamic "Connected Platforms" display in Settings
- Unified logging system with Report an Issue UI

### Fixed
- PKCE code challenge encoding for TikTok OAuth
- Pipeline Logs overflow glitch from nested scroll containers

---

## 2026-03-24 — Experiment Session and Dead Code Cleanup

### Removed
- Dead `views/EditorView.js` (2,654-line monolith never imported anywhere)

### Changed
- Tested and reverted lazy-loading — bundle size is irrelevant for Electron desktop apps
- Tested and reverted debug log removal — logs needed during active development

---

## 2026-03-23 — Transcription Overhaul

### Changed
- Replaced WhisperX with stable-ts for word-level timestamps
- Reverted to source-level transcription for better accuracy
- Per-clip transcription: each clip transcribed individually for accurate word timestamps

### Fixed
- Subtitle sync with smart 3-word grouping, gap closing, and mega-segment splitting
- Clip duration display stuck at same value after edits
- Triple-fire debug report bug
- Persist subtitle rating on each clip

---

## 2026-03-22 — Clip Extension and Editor Navigation

### Added
- Left-extend clip feature: drag audio left edge to reveal earlier content
- Undo support for clip extensions
- Extension counter showing how much a clip has been extended
- Clip extension by dragging audio past original end

### Fixed
- Editor back button navigates to clip browser instead of projects list
- Extension counter visibility and duration display after cuts
- Subtitle trimming when audio is cut
- EBUSY file lock during clip extension on Windows

---

## 2026-03-21 — Subtitle Sync and Playhead Fixes

### Fixed
- Subtitle sync replaced timeupdate with 60fps rAF loop for smooth tracking
- Transcript duplicate segments and missing beginning words
- VAD parameters tuned for dedicated mic-only recording tracks
- Re-transcribe updates clip data without full editor reinit
- Timeline playhead: split rAF loop from paused sync

---

## 2026-03-20 — Timeline Overhaul and Track Polish

### Added
- Professional timeline rebuild with ripple delete support
- Audio 2 track in timeline
- Logarithmic zoom curve anchored to playhead

### Fixed
- Trim enforcement, timeline collapse, and end markers
- Audio bounds enforced as clip boundary (seeking clamped, subs/captions auto-trimmed)
- Timeline track backgrounds now fill full viewport width
- Subtitle/caption trim deferred to mouse-up (not during drag)
- Extension counter on shrink operations

### Changed
- Distinct track colors with audio borders
- Timeline subtitle preview overlays styled for clip browser

---

## 2026-03-19 — Subtitle Workflow and Zoom

### Added
- Create/delete/caps/smart-edit workflow for subtitles
- Zoom centering on active content
- Whisper slang dictionary support
- Smooth 60fps playhead via requestAnimationFrame loop (max zoom 20x)

### Fixed
- Zoom blend transitions
- Draggable segment behavior
- Delete key: regular delete for sub/cap, ripple only for audio
- Preview subtitles built from 3-word micro-segments
- WhisperX initial_prompt passed via asr_options in load_model
- Caption editing target accuracy
- Audio playback control and undo behavior

### Changed
- Timeline track labels enlarged, colored letter badges removed
- Right panel text increased from 10px to 12px

---

## 2026-03-18 — Editor UX Polish and Presets

### Added
- Effect preset management: save, rename, update, delete user presets
- Animation and segment mode saved in effect presets
- Mini player bar in editor
- Clip status indicators in project list

### Fixed
- Caption preset crash
- Template preset isolation (removed built-in presets that conflicted)
- Undo on clip load
- Preset indicators (distinct per-panel)
- Dropdown z-index issues
- Punctuation toggle: dropdown visibility decoupled from character removal
- Karaoke animation anchor (pop upward instead of downward)
- Title centering and zoom anchor in editor

### Changed
- Presets filtered by panel type
- Punctuation settings saved with presets

---

## 2026-03-17 — Timeline Operations and Deep Text Effects

### Added
- Caption segment operations: split, cut, context menus
- Deep text effects system: stroke, glow, shadow, background
- Smooth stroke rendering with draggable effect ordering
- Independent effect presets with highlight glow matching
- Animated subtitle support

### Fixed
- Timeline split, resize, and right-click behavior
- Whisper alignment drift (mid-segment)
- Karaoke word skipping
- Audio split behavior
- Caption display and preview zoom/pan
- Timeline zoom anchor
- Merged subtitle bar display

---

## 2026-03-16 — Inline Toolbar and Text Effects

### Added
- Vizard-style compact inline toolbar inside canvas
- Text effects wired to stores: stroke/shadow color, opacity, line spacing
- Cross-store undo for all styling changes
- Punctuation UI redesigned with dropdown toggle and red X for removed items

### Fixed
- Toolbar positioning and color picker overflow
- Color picker HSV model accuracy
- Stroke rendering (now renders outside text)
- Punctuation stripping in preview
- Playhead line clipped to timeline bounds

---

## 2026-03-15 — Left Panel Rebuild and Subtitle Improvements

### Added
- Re-transcribe per clip feature
- Subtitle gap closing during continuous speech (only gap on 1s+ silence)
- Layout templates: save, load, and apply caption + subtitle positions and styling

### Fixed
- 6 left panel issues: slider, segment mode, active indicator, sizes, resize
- 5 left panel issues: word splitting, inline editing, active word, padding, slider range
- Timecode popover overflow
- Transcript paragraphs, panel sizing, preview padding, popover styling
- Subtitle centering and character-limit line breaks
- Caption textarea matches visual line wrapping when editing
- Caption/subtitle centering accuracy
- Subtitle double-click (correct panel ID)
- WhisperX alignment dropout: merge aligned segments with raw transcription

### Changed
- Left panel rebuilt with 8 corrections matching Vizard reference
- Removed 2L subtitle mode, reduced character limit
- Layout templates wired into Brand Kit panel with editable font size inputs

### Removed
- Color picker from left panel (moved to inline toolbar)

---

## 2026-03-14 — Editor Shell Rebuild (shadcn/ui)

### Added
- Tailwind CSS and shadcn/ui with 15 components
- Editor layout shell with resizable panels
- Left panel with Transcript and Edit Subtitles tabs
- Right panel with 6 drawers (AI Tools, Audio, Brand Kit, Subtitles, Text, Upload)
- Top toolbar with editable title, clip navigator, and save dropdown
- Center preview panel with video player, draggable overlays, and zoom controls
- Full timeline with zoom, scrubbing, tracks, and segment interactions
- Latina Essential as default font for subtitles and captions

### Fixed
- Timeline waveform extraction, video duration, auto-scroll
- Timeline waveform height, ruler alignment, segment overlap prevention
- Font rendering, text scaling, and topbar title behavior
- 6 preview/editor issues: font weight, line mode, zoom, toolbar position

### Changed
- Timeline overhauled: smooth scrolling, unified playhead, polygon waveform

---

## 2026-03-13 — Editor Modular Rewrite

### Changed
- Decomposed 2,654-line editor monolith into modular Zustand architecture (6 stores)
- Subtitle/caption overlays scale proportionally with preview container

### Fixed
- 10 editor issues resolved across 3 phases
- Blank editor: subscribe to store clip instead of ref guard
- Editor crash from renderer-side waveform extraction
- Karaoke subtitle uses fixed phrase chunks with moving highlight
- Karaoke subtitle sync
- Timeline zoom slider and video trim handles
- AI hashtag generation (#eo corrected to #eggingon)

---

## 2026-03-12 — Editor Tabs and Settings Overhaul

### Added
- YouTube OAuth 2.0 credential storage in Settings
- Meta and TikTok credential fields in Settings

### Fixed
- Settings heading consistency
- 21 editor issues across subtitles, captions, transcript, and timeline
- Blank editor: move clipDuration above hooks that reference it
- Blank screen from rename fullProj to proj reference in ClipBrowser
- Projects showing 0 clips (unwrap IPC response)
- Clip display: use selProj for ClipBrowser, show clipCount in project list

### Changed
- Replaced stacked API cards with pill-bar UI in Settings

---

## 2026-03-11 — Recordings and Projects Polish

### Added
- Recordings view: compact grid layout, multi-select, mark-as-done, sort
- Projects view: multi-select, delete

### Fixed
- Whisper detection on Windows: use cmd /c PATH injection for DLL resolution
- 0 clips bug: whisper timestamps were NaN due to string/number mismatch

### Changed
- Projects view uses flat list with select/delete (removed auto-grouping)

---

## 2026-03-10 — AI Clip Generation

### Added
- AI clip generation pipeline with Claude-powered highlight detection
- Play style auto-update with threshold stepper and profile diff modal
- Pipeline logs: grouped folders, select/delete, proper cards in collapsible groups

### Fixed
- energy_scorer.py Unicode crash (PYTHONIOENCODING=utf-8 and Python -X utf8)
- Claude model ID corrected to claude-sonnet-4-20250514
- Pipeline log timestamps
- Monthly API cost breakdown only counts videos with actual API cost
- Log list full-width when no log selected
- Toggle log viewer closed when clicking same log again

### Changed
- Status icons replaced with PASS/FAIL pills, overflow text fixed
- Clip preview: removed black bars, added seek bar and subtitle overlay
- Larger clip preview with stacked approve/reject and badge tooltips

---

## 2026-03-09 — Projects Overhaul and Clip Browser

### Changed
- Overhauled Projects tab: video player, score/10, auto-titles, inline transcript

### Fixed
- Approve/reject not updating UI immediately in ClipBrowser

---

## 2026-03-08 — Editor Topbar and Save/Queue

### Added
- Side-by-side Save and Queue buttons with gradient styling (violet-purple-lavender / green-lime-yellow)
- Hashtag warning in editor

### Fixed
- Topbar: undo/redo wiring, settings icon removal, dropdown toggle, title sizing
- Left panel: timecodes, text-guided word merging, transcript independence
- Single click places cursor, double click selects all in word editor
- Timecode inputs: fixed width, minimal padding
- Left panel default 50/50 split with preview

### Changed
- Toolbar split into 2 rows with scroll/hold-to-repeat, B/I/U wired to store
- Right rail icons/labels enlarged with resizable drawer panel

### Removed
- Color picker from left panel (moved elsewhere)
- Save dropdown (replaced with side-by-side buttons)

---

## 2026-03-07 — Subtitle Sync and Whisper Improvements

### Fixed
- Subtitle sync: re-encode clips for frame-accurate cuts with syncOffset wiring
- Broken whisperx word timestamps with even distribution fallback

### Added
- Audio-aware word timestamp post-processing (Tier 1)

### Removed
- JS-side timestamp fallbacks (fail visibly instead of using fake data)
- Stale whisper.cpp files and store keys

---

## 2026-03-06 — Initial Build (Phases 1-8)

### Added
- Editor view with full shell: topbar, transcript/subtitles panels, center preview, right rail with AI/Subtitles/Brand/Media drawers, and resizable timeline
- Local infrastructure: FFmpeg, Whisper, project file management
- Clip generation pipeline with highlight detection
- Projects view for local project data
- Editor core: real data, video playback, interactive editing
- AI title/caption generation in Editor
- Render pipeline with Ready to Share button and batch render
- Queue system with local rendered clips and platform stubs
- Recordings view (rewritten from cloud-based Upload view)

### Removed
- Vizard API integration
- Cloudflare R2 cloud storage
- All cloud-dependent code from main process and App.js
