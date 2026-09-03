# Port plan: word-timing voters → raw + HuBERT-large + Vosk + Parakeet ("option 3")

Decided by Fega 2026-09-03 after study §10 (`subtitle-timing-learning-2026-09-02.md`).
Executes in a fresh session. Two sessions: **A = code + scoring**, **B = packaging (#357) + cut.**
Nothing here is built yet.

## What Fega gets (plain language)

- Subtitle word timing goes from 84% to ~87% of words landing where he would put them, using
  only free-to-sell tools (MIT / BSD / Apache / CC-BY).
- The 30-minute recording pass stops doing word timing it never uses (≈ 100 s faster, #359).
- A 20-clip run ends up about where it is today: each clip pays ~5-6 s more for the two new
  voters, the full pass pays ~100 s less.
- Customers finally get the voters at all (#357): today they get none.
- One-time download grows by ~2.3 GB (HuBERT 1.2 GB, Parakeet int8 0.6 GB, Vosk 0.2 GB,
  WhisperX code ~0.3 GB).

## Success criteria (measured, not eyeballed)

1. `score_production.py <s233 scratchpad> median` through the real `refine_word_timing`
   ≥ 86.3% of words within 100 ms (harness said 86.8%; the real function ran ~0.5 under the
   harness in s232). Every fallback row scored too (see ladder).
2. On a fresh clip, the pipeline log shows `[TIMING] {'method': 'median4', ...}` (needs #358).
3. Full-recording transcription of a 30-min file drops by ~100 s vs tonight's 274 s and its
   log shows no word-timing line at all (#359).
4. The laptop (fresh-customer machine, no NVIDIA) installs the three models through Finish
   Setup and logs the same `median4` line on its first clip.
5. jest green, `npm run build:renderer`, dev-profile boot clean, 29/29 chunker tests untouched.

## Session A — code

### A1. `tools/word_timing.py`

- **HuBERT-large replaces the base wav2vec2**: `_load_align_model` passes
  `model_name=os.environ.get("CORVA_ALIGN_MODEL") or "HUBERT_ASR_LARGE"` to
  `whisperx.load_align_model`. Same code path, same `whisperx.align` call. Keep the
  WhisperX-base name available via the env var for the option-2 fallback.
- **Qwen block goes** (loader, `qwen_word_starts`, `QW_BIAS`, `QWEN_MODEL`). It is in no
  winning set and OOMs on long audio.
- **New opinion: Vosk** (`vosk_word_starts`): `Model(<vosk dir>)` cached like `_ALIGN`;
  `KaldiRecognizer(model, sr, json.dumps([normalized transcript, "[unk]"]))`, `SetWords(True)`,
  feed the clip in 1 s frames, collect `result` words, drop `[unk]`. Needs 16 kHz (it is).
  Normalize text the way `vosk_run.py` does (lowercase, alnum + apostrophe). Words missing
  from Vosk's lexicon are simply not placed → that word has one fewer opinion.
- **New opinion: Parakeet** (`parakeet_word_starts`): `sherpa_onnx.OfflineRecognizer.from_transducer`
  with the **int8** parakeet-tdt-0.6b-v2 files, `model_type="nemo_transducer"`, cached; decode
  in chunks of ≤ 60 s (a 5-min chunk crashed with bad_alloc; clips are ≤ ~60 s but guard
  anyway, offsetting timestamps by the chunk start); words = tokens split on the `▁` prefix,
  start = first token's timestamp. `num_threads`: min(8, cpu_count) — measure against the
  pipeline's other CPU work in Session B.
- **Biases**: re-measure on untouched words with the harness (`combo2.py` computes them; add
  a print). Constants `HB_BIAS`, `VK_BIAS`, `PK_BIAS` replace `WX_BIAS`/`QW_BIAS`.
- **Median semantics**: `apply_median` takes `vals[len(vals)//2]` — the UPPER middle for an
  even count. The 86.8% was scored with `statistics.median` (mean of the two middles). With
  raw + 3 opinions = 4 values, make `apply_median` use the true median. Score both ways once
  to confirm the harness number carries over.
- **Ladder** (`refine_word_timing`): opinions available →
  - 3 → `median4` (raw + HuBERT + Vosk + Parakeet)
  - 2 → `median3` (any two + raw; strict median)
  - 1 → HuBERT alone → gated + snap (`whisperx+snap`, unchanged); Vosk alone → gated + snap
    too (Vosk alone 83.0% > raw, so it qualifies where Qwen did not); Parakeet alone → NOT
    used (67.8%), snap only
  - 0 → `snap`
  Each row gets a `score_production.py` mode and a number in the study before the cut.
- Docstring rewritten to the new facts. No other behaviour changes (snap, `_enforce_order`,
  `_nearest` window stay).

### A2. Clip-only timing (#359)

- `transcribe.py`: new flag `--word-timing`; `transcribe_one(..., word_timing=False)` only
  calls `refine_word_timing` when true. Full-recording pass = no refine at all (its words feed
  detection/SRT only; the snap is not worth keeping there either).
- `src/main/ai/transcription/stable-ts.js`: `batchTranscribe` always passes `--word-timing`
  (batch = clip retranscription). Single-file `transcribe(wavPath, opts)` passes it only when
  `opts.wordTiming === true`.
- Callers: `src/main/main.js` Retranscribe-button path (~line 2696) sets `wordTiming: true`;
  `src/main/ai-pipeline.js:657` (full recording) does not. Check `whisper.js` fallback path
  (per-clip sequential transcribe when batch is unavailable) also sets it.
- Verify the full-pass words are not read anywhere as subtitle input (memory: subtitles come
  from `clip.transcription`; `resolveSubtitles` — confirm with grep before removing).

### A3. #358 folded in

Forward the transcribe child's stderr `[TIMING]`/`[INFO]` lines into the `PipelineLogger`
(stable-ts.js has the child's stderr; the pipeline logger is reachable from the caller). Without
this, criterion 2 cannot be checked on a customer log.

### A4. Scoring (before anything is committed as "done")

- Run `combo2.py` once more with the real bias print; `score_production.py` for `median`
  and each ladder row; `compare.py` for the finalist at 50/150/200 ms.
- Record the numbers in the study as §10f.
- Fresh-clip check on Fega's machine: Retranscribe one rejected clip, read `[TIMING]`.

### A5. Tests

- Python: extend whatever covers `word_timing` (currently none — add a small
  `tools/tests/test_word_timing.py`: median semantics, ladder selection with stubbed
  opinions, `_enforce_order`). jest unaffected.

## Session B — packaging (#357, rewritten) and cut

### B1. Engine venv + zip (R1 decision: pre-built relocatable runtime from the known-good venv)

- Add to `D:\whisper\betterwhisperx-venv`: `vosk==0.3.45`, `sherpa-onnx==1.13.7`
  (+ `onnxruntime` it pins — 1.24.4 already in constraints; check it does not pull a second
  onnxruntime). `whisperx==3.8.2` is in the constraints but NOT in `requirements.txt` → add it
  and confirm what it drags (pyannote-audio 4.0.4 is pinned; measure the unpacked delta).
- `tools/runtime/requirements.txt` += whisperx, vosk, sherpa-onnx; regenerate both
  constraints files from the venv (`pip freeze`), CUDA and CPU.
- Rebuild `clipflow-runtime-{cuda,cpu}-v1.1.0.zip`, publish to R2 `engine/v1.1.0/`, bump
  `manifest.json` (`sizeBytes`, `unpackedBytes`, sha256). The build and publish procedure IS
  in the repo: `scripts/build-runtime.ps1` (zip from the venv + requirements/constraints) and
  `scripts/publish-runtime.ps1` (R2 upload + manifest). Read both before touching the venv.

### B2. Model pre-download (Finish Setup)

- Mirror the three model payloads to R2 (`engine.flowve.app/models/...`) so we do not depend
  on torch-hub / alphacephei / GitHub at customer install time:
  - `hubert_fairseq_large_ll60k_asr_ls960.pth` (1.26 GB) → place in `TORCH_HOME/hub/checkpoints/`
    (set `TORCH_HOME` under the engine root next to `HF_HOME`, and pass it in `stable-ts.js`
    like `HF_HOME`).
  - `vosk-model-en-us-0.22-lgraph` (205 MB dir) → `<engineRoot>/models/vosk/`.
  - `sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8` (~600 MB) → `<engineRoot>/models/parakeet/`.
- `tools/download_model.py` grows a `--extra` phase (same `TOTAL/PROGRESS/DONE` protocol) or a
  sibling `download_timing_models.py`; `setup-runtime.js` runs it after the Whisper model and
  raises `MODEL_RESERVE_BYTES` by the new ~2.1 GB. Resume/idempotence like the Whisper model.
- `word_timing.py` reads the model dirs from env (`CORVA_VOSK_MODEL`, `CORVA_PARAKEET_MODEL`)
  with Fega's `D:\whisper\...` paths as the dev default.

### B3. Cut and verify

- `clipflow-update-launcher` skill → alpha.23. Verify `dist/win-unpacked/resources/tools/`
  has `word_timing.py`; `npx asar list` for anything new.
- Laptop: Finish Setup shows the extra downloads; first clip logs `median4`; note CPU time per
  clip (HuBERT ~4 s + Vosk ~2 s + Parakeet ~3 s expected).
- Rewrite #357's "done means" to this list; close #359 with the full-pass timing from a log.

## Watch out for

- **Vosk unknown words**: gaming vocabulary ("3v1", "Fega") is dropped by the lgraph lexicon;
  4.2% of words lose that opinion and fall to a 3-way median. Adding words to a Vosk grammar
  needs the lexicon to contain them — it is NOT a simple custom-words list; treat as a
  measurement, not a fix, unless the rate hurts the score.
- Parakeet is transcription, not forced alignment: match by normalized text + nearest start,
  never trust it alone.
- Even-count median (see A1). Do not ship until the real-function score matches the harness.
- `refine_word_timing` must never raise (pipeline contract); every new loader follows the
  `_ALIGN`-style `failed` latch so a missing model costs one log line, not a retry per clip.
- `whisperx.align` "Failed to align segment" warnings are stable-ts segment-boundary issues
  (identical count for every backbone); not a regression.
- Sentry/Electron infra rules do not apply; R1 in the infra dashboard does (relocatable runtime,
  R2 hosting) — flag in chat if B1 has to diverge.
