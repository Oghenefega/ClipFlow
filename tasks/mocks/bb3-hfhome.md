## Problem
The HuggingFace cache dir (`hfHome` / `HF_HOME`) is hardcoded to `D:\whisper\hf_cache` in multiple places. There's no electron-store default and no Settings UI. On a machine without a `D:` drive (most customer machines), the alignment-model cache can't be written/read and transcription breaks.

Surfaced by the session-85 packaged-app audit (Bucket B).

## Hardcode sites
- `src/main/ai/transcription/stable-ts.js:116, 219`
- `src/main/ai-pipeline.js:480`
- `src/main/main.js:1249`
- `tools/transcribe.py:26-27`

## Fix (proposed)
- Default `hfHome` to `path.join(app.getPath("userData"), "hf_cache")`.
- Centralize into a single resolver instead of 5 separate literals; pass it into the Python scripts as an env var / arg.
- Add an electron-store default + migration (per the schema-migration hard rule) so existing installed profiles pick it up.

## Done means
Transcription works on a C:-only machine with no `D:` drive; the HF cache lives under userData.

## Why this matters
Blocks transcription on most customer machines. Part of the Python/Whisper bundling family — parked under `track: launch-ops`.
