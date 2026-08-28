## Problem
The packaged app invokes FFmpeg/FFprobe via bare PATH lookups (`spawn("ffmpeg")`, `execFile("ffprobe")`) with no bundled binary and no path resolver. On the test machine these resolve because FFmpeg is on PATH, but **on a customer machine without FFmpeg installed, every clip cut, probe, waveform extract, and subtitle-overlay render fails.**

Surfaced by the session-85 packaged-app audit (Bucket B).

## Call sites (bare ffmpeg/ffprobe spawns)
- `src/main/ffmpeg.js` — lines 13, 33, 109, 164, 214, 246, 269, 335, 415, 470, 531
- `src/main/render.js` — 15, 347
- `src/main/subtitle-overlay-renderer.js` — 29, 54
- `src/main/ai-pipeline.js` — 338

No `ffmpeg-static`/`ffprobe-static` dependency; no resolver.

## Fix (proposed)
- Add `ffmpeg-static` + `ffprobe-static`, or ship vetted static builds via electron-builder `extraResources` (mirror the #143 `tools/` pattern).
- Add `getFfmpegPath()` / `getFfprobePath()` resolvers: `process.resourcesPath` when `app.isPackaged`, else the static-dep/repo path. Route ALL call sites above through them.
- Gate pipeline Stage 0 on a `checkFfmpeg()` presence check that fails loudly with an actionable message.

## Done means
On a clean machine with no system FFmpeg, clip generation, waveform extraction, and subtitle-overlay render all succeed.

## Why this matters
Hard blocker for any customer install. Not urgent for the current single-tester machine (FFmpeg present). Parked under `track: launch-ops`.
