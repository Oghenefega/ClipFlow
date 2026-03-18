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
