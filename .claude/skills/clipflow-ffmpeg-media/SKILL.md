---
name: clipflow-ffmpeg-media
description: Use when working with FFmpeg, video processing, audio extraction, clip cutting, subtitle rendering, waveform extraction, or any media pipeline operation in ClipFlow. Also triggers for whisper transcription, word timestamp repair, and audio analysis.
---

# ClipFlow FFmpeg & Media Pipeline

All media processing runs locally via FFmpeg and whisper in the Electron main process. NEVER in the renderer.

## Clips are cut lazily

The editor previews the source and `render.js` encodes from it at export (#76). New frame-accurate cutting code re-encodes (`buildEncoderArgs`); `-c copy` snaps to keyframes and is only for whole-file remux (`remuxToMp4`).

## Subtitle Rendering (offscreen PNG pipe — NOT ASS)

There is no ASS file and no `ass=` filter anywhere in the pipeline. Subtitles are
painted by an **offscreen transparent BrowserWindow** running the same style engine
the editor preview uses, and streamed into FFmpeg as PNG frames.

The render pipeline (`render.js` → `subtitle-overlay-renderer.js`):
1. `resolveTimelineSubtitles` builds the segments, clip-relative
2. `createOverlaySession` opens the offscreen window at the output canvas size —
   probed from the source, or the explicit override reframe passes (#164). The
   style engine is authored for 1080px width, so everything scales by `width / 1080`
3. Frames are captured at `OVERLAY_FPS = 30` (10fps read as stop-motion, #148) and
   piped straight into FFmpeg's stdin — `-f image2pipe -framerate <session.fps> -i pipe:0`,
   no PNG files on disk. Output is conformed to the source fps, not to 30
4. A frame identical to the previous one re-sends the cached PNG instead of
   re-capturing (the log reports `N captured, M skipped (identical)`)
5. Composited last, on top of everything: `[v][sub]overlay=0:0:eof_action=pass[out]`
6. Output to configured output folder; progress events via IPC (`render:progress`)

`renderThumbnail` drives the same engine, so a thumbnail is pixel-identical to the
frame the render produces at that moment.

## Audio/Waveform Extraction

- Extract audio: `ffmpeg -i source.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav`
- Waveform peaks: MUST be extracted in main process via FFmpeg (streaming/seeking)
- NEVER `fetch()` + `decodeAudioData()` a source recording in the renderer (multi-GB → OOM); the renderer decodes only the short WAVs main extracts (`extractStems` → `stemPlayer.js`)
- If waveform data isn't ready, show "Extracting waveform..." text, NOT fake waveforms

## Whisper Transcription

### Pipeline
1. Extract WAV from source video (16kHz mono)
2. `src/main/whisper.js` is a facade over the active provider (default `src/main/ai/transcription/stable-ts.js`), which runs `tools/transcribe.py` in the engine's Python runtime as a typed-argv child process (no shell string) — read it for the current timing stages
3. Return segments with `.text` (correct words) and `.words` (subword tokens with timestamps)

### Word Timestamp Post-Processing (transcribe.py)
- Compute RMS energy in 20ms frames
- Detect speech regions (energy > threshold)
- For broken segments (bunched timestamps, zero-duration, poor coverage): energy-weighted redistribution
- For OK segments: snap word onsets to nearest speech onset in audio
- Cross-segment overlap prevention

### Token Merging (JS side)
Whisper returns subword tokens. Merge using segment `.text` as ground truth — see clipflow-editor-patterns skill.

## Timeouts

Timeouts live beside each `execFile` call in `ffmpeg.js` and in `ai/transcription/stable-ts.js` (60 min); read them there.

## Distilled Lessons (gaps)

- **Learning from the user's edits: the first metric is symmetric (|Δ| > threshold), split by position/category, both directions side by side (s231).** A one-sided threshold picked from the first symptom silently drops every correction in the other direction; when Fega says "it's not just X", re-run the count before defending X.
- **A single-model score is not a ceiling until the cheapest ensemble has been scored (s232).** Before writing "the residual is taste", take the median / agreement vote of the models already on disk; independent errors average out (three aligners each below raw → their median 6 points above it).

- **Per-clip re-transcription for word-level karaoke.** NEVER slice word timestamps from a long source transcription and offset them — whisperx wav2vec2 alignment degrades badly on long audio (uniform ~0.7s spacing, mega-segments). Re-transcribe each SHORT clip (15-60s) individually. Source-level transcription is fine for highlight detection (segment-level timing is enough there).
- **whisperx.align() is lossy** — it silently drops segments it can't align (the rest pass through, so a "did it return anything" fallback never triggers). ALWAYS merge aligned output with the raw transcription by text match; keep the raw segment when the aligned one is missing. Log dropped segments.
- **CUDA version must match between torch and ctranslate2.** ctranslate2 4.7.1 needs `cublas64_12.dll` → torch must be a cu12x build (e.g. 2.7.1+cu126). `torch.version.cuda` is the thing that matters; system CUDA version is irrelevant — torch bundles its own DLLs in `torch/lib/`.
- **`initial_prompt` seeds slang/gaming vocab** ("ain't", "gonna", proper nouns); `transcribe.py` passes it to the stable-ts `transcribe()` call (`--initial_prompt`). Keep it concise.
- **Never add Whisper flags that penalize silence** (`no_speech_threshold`) — gaming audio has legitimate long silences (stealth, boss fights) followed by loud reactions; you'd drop the payoff. Only target repetition/hallucination: `condition_on_previous_text=False`, `compression_ratio_threshold`, `log_prob_threshold`.
- **Verifying burned-in subtitles:** don't trust "I see text in the frame" — gaming HUD/UI text looks like a caption. Cross-check on-screen text against the clip's actual subtitle data (segment text + timestamp at that moment). If it doesn't match a known segment, it's not ours.
- **`extractWaveformPeaks` downsamples to 1000 Hz** (a fixed envelope rate, #64) — anything above ~500 Hz is filtered to silence, so a synthetic test tone above that draws a FLAT waveform and reads as a bug in the drawing code. Real SFX/music/voice always carry low-frequency content. Keep audio fixtures under 500 Hz (session 135: an 880 Hz sine came back as all-zero peaks).
- **`atrim` keeps the source timestamps** — any chain that trims a window then positions it (`adelay`) MUST insert `asetpts=PTS-STARTPTS` between them, or the delay stacks on the original PTS and the sound lands late by its own trim offset. Same for fades: they measure from the rebased zero.
- **`volumedetect` prints at info level, so `-v error` suppresses its own output.** Use `ffmpeg -hide_banner -i in.mp4 -af "bandpass=f=<hz>:w=60,atrim=<t1>:<t2>,volumedetect" -f null -` and grep `mean_volume`; a silent result means the log level ate it, not that the audio is silent.
- **Editor preview is Chromium playing the RAW source file** (Phase 4, `PreviewPanelNew.js` `videoSrc = file://project.sourceFile`) — Chromium decodes only AAC/MP3/Opus/Vorbis/FLAC/PCM audio; ALAC (or other exotic OBS "quality" codecs) plays video with SILENT audio, no error, while every FFmpeg path (whisper extract, waveform, render) keeps working. For any "editor has no sound / no video but subtitles fine" symptom: `ffprobe` the actual source recording FIRST — it's probably the codec, not the pipeline (2026-07-21 ALAC incident, product guard tracked as #178).
- **`overlay` eof_action is a parity decision, not a default (#310 s203).** Media overlays (stills/GIFs under the subtitles) use `eof_action=repeat`: a play-once GIF then freezes on its last frame, exactly what Chromium's `<img>` does in the preview. The subtitle PNG-pipe composite keeps `eof_action=pass` on purpose — a pipe ending early must drop the overlay, never hold a stale frame over the picture. Don't "unify" them.
- **`eof_action=repeat` + an endless input = a render that never finishes (#311 s204).** `-loop 1` (a still) and `-ignore_loop 0` on a loop-forever GIF both make an input with no end; with `repeat` the overlay stage keeps producing output after the picture is done and FFmpeg runs until it's killed. Measured: a 10s clip with one still overlay was still encoding at 60s and 3.6 MB. Every looping overlay input therefore carries a `-t` cap so it ends with the picture — the timeline's length for a still, `timelineDuration - tlStart` for a GIF (its stream is setpts-shifted to its block, so an uncorrected cap overruns the export by exactly tlStart — measured 11.9s from an 8s clip). A GIF that plays ONCE still ends early on its own and still freezes on its last frame — the caps don't touch the parity decision above. A video overlay (#311) plays once and ends, but possibly LATER than the picture: `overlay` (shortest=0) repeats the main's last frame while a secondary stream still runs, so a window past the clip's end extended an 8s export to 30s. The render therefore also carries an output-level `-t <timelineDuration>` (s205 review) — the backstop that bounds EVERY overlay shape; don't remove it when tidying the input caps, or vice versa.
- **The offscreen overlay window hands back STALE frames — a capture is only trusted after a content check (#363 s241).** `capturePage()` on the subtitle-overlay BrowserWindow returned the previous picture on ~1 changed frame in 20 under load and on every first frame, even after a double-rAF paint handshake; the identical-frame cache then replayed that stale (empty) frame for a whole title card. `captureExpected` in `subtitle-overlay-renderer.js` rejects a capture that is blank where the page says content is visible, or byte-identical to the previous frame across a line/caption/word change, and re-captures after one more paint (bounded). Never reintroduce a fixed sleep before `capturePage`, never bypass the guards, and keep `empty` true when NO caption overlay exists (`capSig === "x"`) or every silent gap burns retries.
- **Prove an overlay change by DIFFING two renders, never by thresholding brightness (session 244).** To show a disabled subtitle line was gone from the export I counted near-white pixels (>235 gray) in the subtitle band: control and disabled renders both read ~3,300 and the probe said FAIL twice, because gameplay fills that band with bright pixels on every frame and a whole line of text is ~1% of the count. The fix was already correct. Two renders of the same clip with the same encoder are deterministic, so render twice — once with the change — and compare frames pixel by pixel: 1,870 changed pixels inside the line's 0.4 s window, exactly 0 everywhere else including 1 s either side. The diff needs no assumption about where the element sits, what colour it is or how it is styled, and the "0 elsewhere" half is what proves nothing else was disturbed. `scripts/dev/subtitle-disable-probe.js` is the worked example.
- **Read commit free before any real transcription-engine run, test or by hand (s273).** DaVinci Resolve can hold ~15 GB. Near the commit limit, `transcribe.py` goes silent for ~15 min in the word-timing vote and dies with no traceback, or fails with `MemoryError: bad allocation` (host memory, not VRAM). It can also starve Resolve itself. Check with PowerShell `(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory/1MB` (GB). Under ~8 GB, don't run: stub `whisper.transcribeBatch` in main (reach it through `process.getBuiltinModule("module")._cache`, since `process.mainModule` is Electron itself) with canned output in transcribe.py's exact shape. Cap by-hand runs with `timeout 300`. Memory `project_engine_memory_pressure`.
- **A fixture for anything that reads audio by track INDEX must match `audioSetup.trackCount`, so ffprobe it first (s273).** January's recordings have 4 audio tracks against today's 5-track setup. On those, `transcriptionAudioTrack=1` is game audio and Whisper returns nonsense ("not a cat, but a cat…"), which reads like an engine or code bug. Count the audio streams with `ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 <file>` and pick a recording made after the 2026-08-20 calibration.
