---
name: clipflow-ffmpeg-media
description: Use when working with FFmpeg, video processing, audio extraction, clip cutting, subtitle rendering, waveform extraction, or any media pipeline operation in ClipFlow. Also triggers for whisper transcription, word timestamp repair, and audio analysis.
---

# ClipFlow FFmpeg & Media Pipeline

All media processing runs locally via FFmpeg and whisper in the Electron main process. NEVER in the renderer.

## FFmpeg Clip Cutting — MUST Re-encode

```javascript
// CORRECT — frame-accurate cuts
args = ['-i', src, '-ss', start, '-to', end,
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
  '-c:a', 'aac', '-b:a', '192k', dst];
// Timeout: 600000ms (10 min for re-encoding)
```

**NEVER use `-c copy` for clip cutting.** Stream copy seeks to the nearest keyframe (2-10s imprecision), causing subtitle sync to be off by seconds. Always re-encode with libx264.

## Subtitle Rendering (ASS Burn-in)

The render pipeline:
1. Generate ASS subtitle file from `editSegments` + styling
2. FFmpeg overlay: `ass=subtitleFile.ass` filter
3. Output to configured output folder
4. Progress events via IPC (`render:progress`)

## Audio/Waveform Extraction

- Extract audio: `ffmpeg -i source.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 output.wav`
- Waveform peaks: MUST be extracted in main process via FFmpeg (streaming/seeking)
- NEVER use `fetch() + decodeAudioData()` in renderer — multi-GB files cause OOM crash
- If waveform data isn't ready, show "Extracting waveform..." text, NOT fake waveforms

## Whisper Transcription

### Pipeline
1. Extract WAV from source video (16kHz mono)
2. Run BetterWhisperX (Python venv at `D:\whisper\betterwhisperx-venv\`)
3. whisperx transcribes → wav2vec2 aligns → word-level timestamps
4. Post-process timestamps with audio energy analysis (`transcribe.py`)
5. Return segments with `.text` (correct words) and `.words` (subword tokens with timestamps)

### Word Timestamp Post-Processing (transcribe.py)
- Compute RMS energy in 20ms frames
- Detect speech regions (energy > threshold)
- For broken segments (bunched timestamps, zero-duration, poor coverage): energy-weighted redistribution
- For OK segments: snap word onsets to nearest speech onset in audio
- Cross-segment overlap prevention

### Token Merging (JS side)
Whisper returns subword tokens. Merge using segment `.text` as ground truth — see clipflow-editor-patterns skill.

## Loudness Analysis

- Per-second loudness levels via FFmpeg
- Used for highlight detection scoring
- Combined with sentiment + keywords + pacing for highlight ranking

## Windows Native Binary Rules

### DLL Loading
Node.js `execFile` does NOT propagate PATH to Windows DLL loader. Use:
```javascript
exec(`cmd /c "set "PATH=${dllDir};%PATH%" && "${binary}" ${args}"`)
```

### CUDA DLLs
- cublas64, cudart64 live in `CUDA\vX.X\bin\x64\` NOT `bin\`
- Always check BOTH `bin\` and `bin\x64\` when auto-discovering

### whisper.cpp JSON Parsing
- `timestamps` field = STRINGS ("HH:MM:SS,mmm") — truthy but not numeric
- `offsets` field = INTEGER milliseconds — use this
- NEVER chain with `||` when first value could be truthy non-numeric
- Use: `toMs(seg.offsets?.from) || toMs(seg.timestamps?.from)`

## Timeouts

| Operation | Timeout |
|-----------|---------|
| Probe (metadata) | 30s |
| Extract audio | 120s |
| Cut clip (re-encode) | 600s (10 min) |
| Transcribe | 600s |
| Render (ASS burn-in) | 600s |
| Thumbnail | 30s |

## Distilled Lessons (gaps)

- **Preserve source framerate on clip cuts.** `cutClip` has historically dropped 60fps → 25fps — make the cut match the source rate (e.g. `-r` matching source / don't let the encoder default it down). Verify output fps after changing cut args.
- **Per-clip re-transcription for word-level karaoke.** NEVER slice word timestamps from a long source transcription and offset them — whisperx wav2vec2 alignment degrades badly on long audio (uniform ~0.7s spacing, mega-segments). Re-transcribe each SHORT clip (15-60s) individually. Source-level transcription is fine for highlight detection (segment-level timing is enough there).
- **whisperx.align() is lossy** — it silently drops segments it can't align (the rest pass through, so a "did it return anything" fallback never triggers). ALWAYS merge aligned output with the raw transcription by text match; keep the raw segment when the aligned one is missing. Log dropped segments.
- **CUDA version must match between torch and ctranslate2.** ctranslate2 4.7.1 needs `cublas64_12.dll` → torch must be a cu12x build (e.g. 2.7.1+cu126). `torch.version.cuda` is the thing that matters; system CUDA version is irrelevant — torch bundles its own DLLs in `torch/lib/`.
- **`initial_prompt` seeds slang/gaming vocab** ("ain't", "gonna", proper nouns) — but it goes in the `asr_options` dict of `whisperx.load_model()`, NOT as a `transcribe()` kwarg (`transcribe()` doesn't accept it → crash). Keep it concise.
- **Never add Whisper flags that penalize silence** (`no_speech_threshold`) — gaming audio has legitimate long silences (stealth, boss fights) followed by loud reactions; you'd drop the payoff. Only target repetition/hallucination: `condition_on_previous_text=False`, `compression_ratio_threshold`, `log_prob_threshold`.
- **Verifying burned-in subtitles:** don't trust "I see text in the frame" — gaming HUD/UI text looks like a caption. Cross-check on-screen text against the clip's actual subtitle data (segment text + timestamp at that moment). If it doesn't match a known segment, it's not ours.
- **Editor preview is Chromium playing the RAW source file** (Phase 4, `PreviewPanelNew.js` `videoSrc = file://project.sourceFile`) — Chromium decodes only AAC/MP3/Opus/Vorbis/FLAC/PCM audio; ALAC (or other exotic OBS "quality" codecs) plays video with SILENT audio, no error, while every FFmpeg path (whisper extract, waveform, render) keeps working. For any "editor has no sound / no video but subtitles fine" symptom: `ffprobe` the actual source recording FIRST — it's probably the codec, not the pipeline (2026-07-21 ALAC incident, product guard tracked as #178).
