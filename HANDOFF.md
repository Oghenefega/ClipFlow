# HANDOFF — Session 235 (2026-09-03)

## Current State

**Session B of the word-timing port is built, published and E2E'd — everything except Parakeet
and the alpha.23 cut.** Runtime v1.1.0 (whisperx + vosk + sherpa-onnx on torch 2.7.1) is on R2
at `engine/v1.1.0/` and `engine/manifest.json` reads 1.1.0 with a `models` list (HuBERT-large
1.26 GB, Vosk 214 MB, both under `models/`). `setup-runtime.js` now has three modes — fresh /
engine upgrade / models-only — downloads the listed models into the engine root with sha256
markers, and `stable-ts.js` passes `TORCH_HOME` + `CORVA_VOSK_MODEL` + `CORVA_PARAKEET_MODEL`
from `app-paths.js timingModelEnv(store)`. Proven: both bundles log `median4` on a real clip
through `transcribe.py --word-timing`; the dev profile seeded as a managed 1.1.0 engine showed
"One more download for subtitles", pulled 1.5 GB at ~98 MB/s, wrote the markers, flipped
`needed` to false; a harness with bogus env still loaded HuBERT + Vosk from the engine root.
jest 226 green, renderer builds. Fega's daily driver is still alpha.22 — none of this reaches an
installed copy until the cut.

## Key Decisions

- whisperx 3.8.2 installs `--no-deps` (`tools/runtime/requirements-nodeps.txt`): its metadata
  pins torch 2.8 while the scored venv runs 2.7.1. pyannote-audio is deliberately NOT in the
  runtime — measured in the venv, `whisperx.alignment` never imports it. If torch ever moves,
  re-evaluate both.
- Model layout under the engine root: `torch_home/hub/checkpoints/<hubert>.pth`, `models/vosk/`,
  `models/parakeet/`; marker `.corva-model.json` = zip sha256 (republish → auto re-download).
- The models-mode / upgrade-mode overlay auto-opens at boot like the fresh one; the
  DependencyBanner's "Finish Setup" button only exists for the missing-python case, so hiding the
  overlay means "next boot". Fine for alpha; note if Fega complains.
- Hand-pointed venvs (`engineRuntime` null — Fega's desktop) never see the flow and never fetch
  the manifest at boot.

## Next Steps

1. **Ask Fega:** OK to download `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8` (~600 MB, GitHub
   k2-fsa/sherpa-onnx asr-models release) to `D:\whisper\sherpa-models\`? (Unanswered at wrap.)
   **Answered at wrap: the full-recording words must NOT stay raw** — "if 100 s is the price, pay
   it". Filed as #360 with two routes (full-pass `hubert+snap` vs re-running the clip voters on
   extension/failure); pick one and build it BEFORE or WITH alpha.23, scored via
   `score_production.py`.
2. After the download: re-score once — `score_production.py <s233 scratchpad> median` with
   `CORVA_PARAKEET_MODEL` pointed at the int8 dir (fp16 = 86.1%; ship fp16 if int8 loses more
   than ~0.3) → `scripts/build-models.ps1` → `scripts/publish-runtime.ps1` (manifest then lists
   three models) → study §10g one paragraph.
3. Cut alpha.23 via `clipflow-update-launcher` (What's New entry in `src/main/release-notes.js`
   must cover the timing port + the setup download). Verify `dist/win-unpacked/resources/tools/`
   holds `word_timing.py`.
4. Laptop: after the update it must offer "Update Corva's AI engine" (engine 1.0.0 → 1.1.0,
   cpu variant 0.5 GB + 3 models), and the first clip's pipeline log must show
   `[PY] [TIMING] {'method': 'median4', ...}`. Note per-clip CPU seconds.
5. Close #359 with the full-pass timing from the next real 30-min run (comment on the issue says
   exactly what to read). #357 body rewritten with the remaining list.
6. Then the old backlog (#353 Batch B, #350).

## Watch Out For

- `build-runtime.ps1` smoke MUST import `whisperx.alignment` — `import whisperx` is lazy and
  proves nothing. Two-step install: `-r requirements.txt -c constraints` then
  `--no-deps -r requirements-nodeps.txt`.
- `build-models.ps1` uses `Get-Item` on each glob (a folder is itself, not its children) and
  stored zips (`--options zip:compression=store`). Zip names keep folder dots
  (`vosk-model-en-us-0.22-lgraph.zip`).
- `publish-runtime.ps1` needs BOTH runtime zips + `manifest-*.json` in `vendor/runtime-dist`
  even for a models-only republish (they are there now; 1.0.0 zips too — 3.3 GB of rollback
  stock, deletable, C: is at ~11 GB free).
- `getState` for a managed engine fetches the manifest at every boot (6 s timeout); offline →
  not needed. Fresh machines unchanged.
- Leftover from the E2E: `D:\tmp\corva-dev-engine` (1.5 GB, the downloaded models) — delete it;
  the dev store is restored (`engineRuntime` null, `engineRoot` "").
- The Bash tool's backslash collapse bit twice more: any patch script containing a backslash
  goes through the Write tool, then `python <file>`.

## Logs/Debugging

- Runtime smoke on the built bytes: `HF_HOME=D:/whisper/hf_cache vendor/runtime-build/{cuda,cpu}/python.exe -X utf8 tools/transcribe.py --audio x.wav --output x.json --word-timing` (cpu: add `--compute_type int8`) → stderr `[TIMING] {... 'method': 'median4', 'voters': ['hubert', 'vosk', 'parakeet']}`.
- Hosted manifest: `curl -s https://engine.flowve.app/engine/manifest.json` → `version` 1.1.0, `models[]`.
- Setup log lines: `app.log` `(system) Timing model installed: <id>`, `Engine runtime upgraded {from,to}`, `Engine setup complete`.
- Dev E2E recipe (this session's scratchpad `a8e790d6-5585-42bb-97b4-7e40358b6097`): `seed_dev_store.py seed|restore`, `cdp.js "<expr>" --shot x.png` (global WebSocket, port 9222), `stablets_env_harness.js <wav>` (bogus env vs store paths).
- Dev boot: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`; kill with `MSYS_NO_PATHCONV=1 taskkill /F /IM electron.exe`.
- Score: `PYTHONIOENCODING=utf-8 HF_HOME=D:/whisper/hf_cache D:/whisper/betterwhisperx-venv/Scripts/python.exe tasks/spikes/subtitle-timing/score_production.py <s233 scratchpad 22638acc-…> median` (~15 min).
