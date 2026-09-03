# HANDOFF — Session 236 (2026-09-03)

## Current State

**alpha.23 is cut and on the update feed** (`engine.flowve.app/updates/alpha.yml` → `Corva Setup
0.4.0-alpha.23.exe`, alpha.22 pruned). It carries everything since alpha.22: the four-voter word
timing (Session A), runtime 1.1.0 + model downloads in Finish Setup (Session B), and this
session's #360. Fega's desktop and the laptop will offer the "Update available" banner on next
launch. **Desktop verified the same day** (Pt2/Pt3 logs: cuda, one `hubert+snap` line, `median4`
on every clip; #359 closed). Laptop still pending.

This session: Parakeet int8 downloaded to `D:\whisper\sherpa-models\sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8`,
re-scored (86.0% vs fp16 86.1% → ships), zipped and published — the hosted engine manifest lists
three models. **#360 route A built and scored:** `transcribe.py --word-timing-light` (HuBERT +
snap) on the full-recording pass, `ai-pipeline.js` `wordTiming: "light"`. Full-pass words were
far worse than the issue assumed — raw **68.3%** (not 78; that was the clip number), snap 74.0%,
HuBERT+snap **77.0%**, HuBERT+Parakeet 80.0% (+140 s CPU, not shipped, one-line flip). Costs on
the 30-min MC Day2 Pt1 file: HuBERT 50 s warm / 66 s cold on the 3090, 234 / 267 s on 8 CPU
threads → `LIGHT_CPU_MAX_SEC = 600` (CPU keeps the snap above 10 min). Whole full pass through
the packaged CUDA runtime: 302 s (alpha.22 ≈ 361 s in the same harness). Study §10g has the table.
jest 226 green, 17 Python unit tests green. `D:\tmp\corva-dev-engine` deleted.

## Key Decisions

- Light pass = HuBERT only. Fega's budget was "~100 s"; HuBERT+Parakeet is ~190 s. The trade
  (80.0% for +140 s) is documented in `transcribe.py`, #360 and §10g — his call if he wants it.
- CPU cap at 10 min rather than CUDA-only: a CPU customer with short recordings still gets HuBERT.
- #360 and the alpha.23 items stay OPEN with `status: untested` until Fega sees the log lines.

## Next Steps

1. **Desktop: DONE.** Pt3 (28 min, 20 clips): Transcription 275 s, `hubert+snap`, 20/20 `median4`;
   Clip Retranscription 282 s (~14 s/clip, was 6.9 — Vosk + Parakeet are CPU-only, HuBERT on GPU;
   Fega accepted). #360 stays `status: untested` until he judges an extended clip's subtitles.
2. **Laptop (fresh-customer machine, CPU only, engine 1.0.0):** after the banner install it must
   auto-open "Update Corva's AI engine" (cpu 1.1.0 runtime 0.5 GB + HuBERT 1.26 GB + Vosk 214 MB
   + Parakeet 661 MB ≈ 2.7 GB; disk preflight needs unpacked + largest zip). Then one clip →
   `median4` in the pipeline log, note per-clip seconds; a >10-min recording's Transcription step
   → `'method': 'snap', 'cpu_cap': 600`. If the overlay does not appear, the DependencyBanner has
   no "Finish Setup" button for this case (s235 note) — it only re-offers at next boot.
3. CPU-cap proof run DONE: `[TIMING] {'method': 'snap', 'cpu_cap': 600}` as designed — but the
   whole 30-min pass took **9,680 s (2.7 h)** on this desktop's CPU runtime (stable-ts refine on
   CPU, not the timing step). Filed #362; the laptop check must record its full-pass time.
4. Then the old backlog (#353 Batch B, #350). #361 (publish-runtime Range verify) is a chore.

## Watch Out For

- `publish-runtime.ps1` throws at its Range verify on a Cloudflare cache MISS (200 instead of
  206) AFTER the manifest is uploaded — the publish still succeeded; re-check with
  `curl -r 0-1023`. Filed #361. The app restarts a download on a 200, so resume just starts over.
- The Bash tool collapses `\\` in heredocs: a python patch with `r"D:\\whisper"` still matched
  because the collapsed form equalled the file's — do not rely on that; use the Write tool for
  anything with backslashes.
- Running the cpu runtime and the cuda runtime at once skews both timings (the 8 CPU threads are
  shared) — the 302 s number is from a run alone.
- `vendor/runtime-dist/` still holds the 1.0.0 zips (3.3 GB rollback stock) — deletable, C: at
  ~11 GB free.
- The int8 model's ONNX files are `encoder.int8.onnx` etc.; `word_timing._parakeet_file` already
  probes `.int8.onnx` before `.fp16.onnx`.

## Logs/Debugging

- Pipeline log lines to look for on alpha.23: Transcription step `[PY] [TIMING] {... 'method': 'hubert+snap' ...}` (desktop) / `'snap', 'cpu_cap': 600` (CPU, >10 min); Clip Retranscription `[PY] [TIMING] {'method': 'median4', 'voters': ['hubert', 'vosk', 'parakeet']}`.
- Setup log lines (laptop): `app.log` `(system) Timing model installed: <id>` ×3, `Engine runtime upgraded {from: 1.0.0, to: 1.1.0}`, `Engine setup complete`.
- Hosted: `curl -s https://engine.flowve.app/engine/manifest.json` → `models[]` = hubert, vosk, parakeet; `curl -s https://engine.flowve.app/updates/alpha.yml | head -1` → alpha.23.
- Score: `PYTHONIOENCODING=utf-8 HF_HOME=D:/whisper/hf_cache D:/whisper/betterwhisperx-venv/Scripts/python.exe tasks/spikes/subtitle-timing/score_production.py <s233 scratchpad 22638acc-…> <mode>` — modes `median|snap|raw|hubert|hubert+parakeet|…`, `FULLPASS=1` for the full-recording words, `CORVA_PARAKEET_MODEL=D:/whisper/sherpa-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8`.
- Full-pass benchmark: this session's scratchpad `0fa676cb-…` has `bench_light.py <wav> <project.json> [cuda|cpu]`, `bench_parakeet.py <wav>`, and the transcribe stderr logs (`transcribe_light2_err.txt` = the 302 s run, `transcribe_light_cpu_err.txt` = the CPU proof). The 30-min wav is `mc_full.wav` in the s233 scratchpad; project.json = `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\.clipflow\projects\proj_1788393739272_0k0fnd\project.json`.
- Packaged runtime smoke: `HF_HOME=D:/whisper/hf_cache vendor/runtime-build/cuda/python.exe -X utf8 tools/transcribe.py --audio x.wav --output x.json --word-timing-light` (cpu: add `--compute_type int8`).
