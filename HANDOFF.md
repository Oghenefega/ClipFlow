# HANDOFF — Session 168 (2026-08-14)

## Current State
App is still **0.3.0-alpha.50** (no installer cut — no renderer/main app code changed this session; the one product fix is in a tool script). The **#146 zero-setup transcription arc is 1 of 3 sessions done**: both AI engine runtime packages are BUILT and 4/4-VERIFIED on this machine. Fega's alpha.50 ember sign-off (session 167) is still pending. His laptop deliberately stays ClipFlow-free until this arc lands — its first boot is the true zero-setup customer test (his explicit call).

## What Was Just Built
- **`tools/runtime/`** — the engine recipe: `requirements.txt` (5 top-level packages: stable-ts, faster-whisper, librosa, soundfile, ai-edge-litert) + `constraints-cuda.txt`/`constraints-cpu.txt` freezing all 121 transitive versions from the known-good venv (`D:\whisper\betterwhisperx-venv`, Python 3.12.3, torch 2.7.1+cu126). Never re-resolve versions — regenerate constraints from a working venv.
- **`scripts/build-runtime.ps1`** — embeddable CPython + two-stage wheel install (a FULL Python pre-builds all wheels into a wheelhouse because the embeddable's `._pth` breaks pip build isolation) → import smoke test (+CUDA gate on cuda variant) → zip via Windows tar.exe → SHA-256 manifest.
- **`scripts/verify-runtime.ps1`** — runs all four pipeline scripts through a built runtime against a 2-min excerpt of a real recording (`-map 0` keeps all 6 audio tracks; MKV excerpt container for HEVC+FLAC; SRT built from the transcription like the real pipeline).
- **Outputs (git-ignored, on disk):** `vendor/runtime-dist/clipflow-runtime-cuda-v1.0.0.zip` (2.73 GB, sha256 504b48ad…) + `clipflow-runtime-cpu-v1.0.0.zip` (0.4 GB) + per-variant manifest JSONs.
- **Product bug fixed: `tools/transcribe.py`** — float16→int8 auto-fallback on CPU. Without it every non-NVIDIA machine crashed on first transcription (ctranslate2 hard-rejects float16 on CPU). Found by the CPU verification pass.

## Key Decisions (all Fega-ratified 2026-08-14; recorded on #146 + infra dashboard entry R1)
- **#251's "manual Whisper setup" beta posture is REVERSED** — zero-setup transcription required before ANY beta build goes out.
- **Managed runtime download** (game-style one-time "Setting up AI engine" first-run step) over bundle-in-installer (3-4 GB per alpha), whisper.cpp (doesn't remove Python — signals need it; regresses stable-ts word timing), and cloud transcription (breaks footage-never-leaves-machine).
- **Hosting: Cloudflare R2 on the ClipFlow business account** (same account as the #249 gateway).
- Also this session: #145/#147 closed as superseded-by-#251 (were stale-open); #146 pulled out of `track: launch-ops` into active work.

## Next Steps (session 2 of the arc)
1. R2 bucket + upload both zips + a combined manifest the app can poll (variant, version, sha256, sizeBytes, url).
2. In-app **Finish Setup** flow: NVIDIA detect (nvidia-smi probe) → download matching zip with progress + resume + checksum → unpack to `userData\runtime` → verify via existing `checkSetup()` probe → set `whisperPythonPath` → pre-download the large-v3-turbo model with visible progress (~1.6 GB, currently ambushes the first transcription).
3. Repoint the deps-check "Whisper isn't set up" item + `PYTHON_SETUP_ERROR` (stable-ts.js) at the Finish Setup flow — kill the Beta Tester Manual pointer (the manual never had those steps anyway).
4. Session 3: clean-machine E2E on Fega's laptop (this IS his laptop install) + failure-mode pass (offline mid-download, disk full, AMD GPU → CPU variant, corrupt unpack).

## Watch Out For
- **CPU transcription is ~25x slower than GPU** (measured: 2-min clip = ~8 min CPU vs ~20 s GPU, large-v3-turbo). Session-2 setup UI should set expectations on non-NVIDIA machines; maybe suggest a smaller model there later.
- **Finish Setup must not fight the #251 boot migrations** — Fega's machines pin the D:\ venv via `whisperPythonPath` migration; only offer the download when `whisperPythonPath` is unset/missing.
- **`transcribe.py` still has `os.environ.setdefault("HF_HOME", "D:\\whisper\\hf_cache")`** (~line 27) — harmless when Node passes HF_HOME, but session 3's clean-machine test must confirm HF_HOME reaches the script on every spawn path.
- **D: drive is nearly full (0.8 GB free)** — the 5.9 GB venv + HF cache live there. Put nothing new on D:.
- **Runtime zips are NOT in git** (`vendor/runtime-build/` + `vendor/runtime-dist/` git-ignored, same pattern as vendor/ffmpeg). Rebuild = rerun `build-runtime.ps1` (~15 min, needs a full Python as `-BuilderPython`, defaults to the venv).
- The zips deliberately exclude `__pycache__`; Python regenerates it in the unpacked (writable) location on first run.

## Logs/Debugging
- Build + verify logs live in this session's scratchpad task files (cuda build `bpiaxrc9l`, cuda verify `b16b1l1p3`, cpu build `bwcc7xano`, cpu verify `bkuwlai0z`).
- Verify harness work dir: `vendor/runtime-build/verify/` (sample.mkv excerpt, wav, all four output JSONs) — regenerated each run.
- Embeddable-Python build gotchas hit this session (all now handled in the scripts): (1) get-pip installs no setuptools → source-only packages (openai-whisper) can't build → two-stage wheelhouse; (2) PowerShell 5.1 parses .ps1 as ANSI → non-ASCII chars (em-dashes) = parse errors → scripts are ASCII-only; (3) bare `tar` under the Bash tool resolves to Git's GNU tar which misreads `C:\` as a hostname → call `$env:SystemRoot\System32\tar.exe`; (4) PS 5.1 mangles embedded quotes in `python -c` snippets → write temp .py files; (5) ffmpeg `-c copy` without `-map 0` silently drops all but one audio track.
