# HANDOFF — Session 234 (2026-09-03)

## Current State

**Session A of the word-timing port is BUILT and scored; Session B (packaging, alpha.23) is
next.** `tools/word_timing.py` votes raw + HuBERT-large + Vosk + Parakeet (true median), Qwen is
gone, the voters run in clip retranscription only (`--word-timing`, #359), and the transcribe
child's `[INFO]`/`[TIMING]` lines reach the pipeline log (#358). Scored through the real function
on the 121 clips: **86.1%** (alpha.22 84.1%); every ladder row in study §10f. 17 unit tests,
jest 223 green, renderer builds, dev profile boots. NOT cut into an installer — Fega's daily
driver is still alpha.22 and has none of this.

Also this session: #297/#298/#299 (crash-safe writes, zombie lock, honest autosave) closed on
field evidence — fixed since alpha.5, `clipflow.db.bak` rotating on prod.

## Key Decisions

- 86.1% accepted over the plan's 86.3% target: the production logic on the identical s233 dumps
  scores 86.2-86.3%, so the harness's 86.8% is matching optimism (~0.5-0.7, same as s232), not a
  port defect. The two ≤0.1 knobs (1.5 s match window, lone-opinion mean) were NOT adopted.
- Method labels: `median4` / `median3` / `hubert+snap` / `vosk+snap` / `snap`, plus a `voters`
  list in every `[TIMING]` line.
- Model paths come from `CORVA_ALIGN_MODEL` / `CORVA_VOSK_MODEL` / `CORVA_PARAKEET_MODEL`, dev
  defaults `HUBERT_ASR_LARGE`, `D:\whisper\vosk-models\...lgraph`,
  `D:\whisper\sherpa-models\...parakeet...-fp16`. The loader accepts int8/fp16/plain onnx names.
- Engine venv `D:\whisper\betterwhisperx-venv` now has vosk 0.3.45 + sherpa-onnx 1.13.7
  (only srt + websockets came along; onnxruntime/numpy untouched) — that IS Session B's B1
  venv step, already done.

## Next Steps

1. **Ask Fega** (surfaced in the wrap, unanswered): the full-recording words still feed subtitles
   for (a) clips whose retranscription failed and (b) extended-into audio; they are raw (78%)
   now vs whisperx+snap (81%) before. Leave as is, or run a cheap snap-only pass on the full
   recording?
2. **Session B** — plan `tasks/specs/subtitle-timing-port-option3-2026-09-03.md`: download the
   Parakeet **int8** model (`sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8`, ~600 MB, needs Fega's
   OK for the download) and re-score `median` once with it; `tools/runtime/requirements.txt` +=
   whisperx, vosk, sherpa-onnx, regenerate constraints, `scripts/build-runtime.ps1` /
   `publish-runtime.ps1` → v1.1.0; R2 model mirrors (HuBERT .pth under `TORCH_HOME`, Vosk dir,
   Parakeet dir) + Finish Setup downloads (`download_model.py` extra phase, `MODEL_RESERVE_BYTES`);
   `stable-ts.js` passes `TORCH_HOME` + the three `CORVA_*` vars like `HF_HOME`; alpha.23;
   laptop check (first clip logs `median4`); rewrite #357, close #359 with a full-pass timing.
3. Then the old backlog (#353 Batch B, #350).

## Watch Out For

- `score_production.py` modes changed: `median` | `snap` | any `+`-joined subset of
  `hubert`/`vosk`/`parakeet`. Old `whisperx`/`qwen` modes are gone.
- Vosk prints "Ignoring word missing in vocabulary" per clip on stderr (gaming words, "fega");
  harmless, not forwarded (only `[TAG]` lines are).
- whisperx's own WARNING lines go to STDOUT, not stderr — never parse transcribe.py's stdout.
- Single-slash `taskkill /IM` in Git Bash is path-mangled and kills nothing (memory trap 45);
  use `MSYS_NO_PATHCONV=1` or double slashes, and never suppress its output.
- Bash heredocs JSON-decode backslashes: a JS file written that way lost `D:\\whisper` → use
  the Write tool or forward slashes for any source with Windows paths.
- Voter dumps + audio for scoring still live in the s233 scratchpad
  (`22638acc-c8d2-4230-861d-76b836143fab`); `score_dumps.py` (dump-fed production logic) and the
  two Node harnesses that drive `stable-ts.js` outside Electron are in THIS session's scratchpad
  (`aca3f1cd-705a-4e91-a99a-ad021d539d21`).

## Logs/Debugging

- Score: `PYTHONIOENCODING=utf-8 HF_HOME=D:/whisper/hf_cache D:/whisper/betterwhisperx-venv/Scripts/python.exe tasks/spikes/subtitle-timing/score_production.py <s233 scratchpad> median` (~15 min).
- Tests: `D:/whisper/betterwhisperx-venv/Scripts/python.exe -m unittest tools/tests/test_word_timing.py`.
- Direct: `python tools/transcribe.py --audio x.wav --output x.json --word-timing` → stderr shows
  `[TIMING] {'method': 'median4', 'voters': [...]}`; without the flag no TIMING line.
- Pipeline log now carries `[PY]  [TIMING] ...` per clip in the Clip Retranscription step;
  Retranscribe button → `app.log` `(subtitles) retranscribe [TIMING] ...`.
- Dev boot: `CLIPFLOW_PROFILE=dev npx electron .` (tokens file confirmed `{"accounts":{}}`),
  kill with `MSYS_NO_PATHCONV=1 taskkill /F /IM electron.exe`.
