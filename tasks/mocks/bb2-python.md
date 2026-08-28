## Problem
The packaged app has no bundled Python/Whisper runtime. `whisperPythonPath` defaults to `""` (`src/main/main.js:183`); when empty, transcription rejects with "Python not found" (`src/main/ai/transcription/stable-ts.js:83-86, 189-192`). On the test machine a local venv at `D:\whisper\...\venv\python.exe` is used; **a customer machine has no Python, no venv, and no stable_whisper/torch — so transcription cannot run at all.**

Surfaced by the session-85 packaged-app audit (Bucket B). Largest portability gap; likely needs an onboarding/bootstrap flow, not a one-line fix.

## What's needed
- A shipped or first-run-installed Python runtime (embeddable Python or a managed venv) with `stable_whisper` + `torch` (CUDA/CPU variants — mind the torch/ctranslate2 CUDA-version-matching lesson).
- Either bundle via `extraResources` + resolve from `process.resourcesPath`, or a setup/onboarding step that downloads+installs on first run with clear progress + failure UI.
- Resolve the hardcoded fallback `whisperPythonPath` (`src/main/ai-pipeline.js:502` → `D:\whisper\...venv\python.exe`) as part of this — user-overridable in Settings today, but the default only exists on the test machine.

## Done means
On a clean machine with no Python, a user can generate a clip end-to-end (transcription included) after the app's setup step, with no manual Python install.

## Why this matters
Hard blocker for any customer install. Pre-launch architecture task — parked under `track: launch-ops`. Related: hfHome hardcode (separate issue), #68 (energy_scorer bundling).
