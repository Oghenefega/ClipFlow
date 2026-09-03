# HANDOFF — Session 233 (2026-09-02/03)

## Current State

**Aligner census done, option 3 chosen, port PLANNED (not built).** Plan:
`tasks/specs/subtitle-timing-port-option3-2026-09-03.md` — Session A (code + scoring), Session B
(#357 packaging + alpha.23). Study §10 has the census (14 free voters, all subsets), §10e the
30-min benchmark. Fega's decision: raw + HuBERT-large + Vosk + Parakeet = 86.8% (shipped 84.1%,
pre-upgrade 77.1%). No product code changed this session.

Filed: #359 (full-recording pass: Qwen OOMs on 30-min audio → silent whisperx+snap, ~100 s
wasted; voters must run per clip only). #358 (stderr → pipeline log) folds into Session A.

## Key Decisions

- Option 3 over option 2: same GPU time (36 s vs 32 s per 30 min), steadier on the split-half
  test (86.8/86.9 vs 85.8/87.7), +0.9 GB download; only CPU-only machines pay 2x per clip.
- Plain per-word median stays; trim = same, gate loses, 5-7 voters no gain. Ceiling ≈ 87%.
- Whisper-family voters (large-v3, distil, st_vad, st_align) LOWER every set — never add one.
- Parakeet/FastConformer never alone; Qwen leaves the runtime entirely.
- Word timing runs in clip retranscription only; the full-recording pass gets no refine.

## Next Steps

1. **Session A** (fresh session, read the plan first): A1 word_timing.py voters + true median +
   ladder; A2 `--word-timing` flag (clip-only); A3 #358 stderr forwarding; A4 score every row
   with `score_production.py` on the s233 scratchpad (≥ 86.3% target); A5 tests; §10f numbers.
2. **Session B**: engine venv + zip v1.1.0 (recover the v1.0.0 build procedure, write it down),
   R2 model mirrors, Finish Setup downloads, alpha.23, laptop check, rewrite #357, close #359.
3. Then the old backlog (#353 Batch B, #350, #297/#299, word ENDS if pills linger wrong).

## Watch Out For

- `apply_median` uses the upper-middle value for even counts; the 86.8% assumed the true
  median. Score both before trusting the number (plan A1).
- Vosk drops words outside its lexicon (4.2%); not a custom-words fix, measure it.
- Parakeet crashes on multi-minute chunks (bad_alloc); ≤ 60 s chunks. Vosk on a 30-min file =
  194 s — never on the full pass.
- All voter dumps + audio + `mc_full.wav`/`val_full.wav` + benchmark scripts live in THIS
  session's scratchpad (`22638acc-...`); copy forward, don't regenerate (~7 min per voter).
- Halves A/B uneven (2170/1184 words); sanity check only.
- `D:\whisper\aligners-venv` (vosk, sherpa-onnx) is a spike venv, not the engine venv.

## Logs/Debugging

- Scoring: `combo2.py <S> v1,v2,... [maxk] [top] [median|trim|gateNN]`, `compare.py <S> "a+b"`,
  `score_production.py <S> median` (whisper venv, `PYTHONIOENCODING=utf-8`).
- Runners: `ctc_run.py <S> <tag> <model>` (whisper venv), `vosk_run.py`, `sherpa_run.py <S>
  parakeet|fcctc` (aligners venv), `bench_gpu.py`/`bench_cpu.py <wav> <project.json>`.
- Models: `~/.cache/torch/hub/checkpoints/hubert_fairseq_large_ll60k_asr_ls960.pth`,
  `D:\whisper\vosk-models\vosk-model-en-us-0.22-lgraph`, `D:\whisper\sherpa-models\...parakeet...fp16`
  (int8 variant still to download for customers).
- Pipeline logs: `%APPDATA%\clipflow\processing\logs\<video>_<ts>.log` — `[DONE] Transcription
  (Ns)` and `[DONE] Clip Retranscription (Ns)` are the like-for-like timing lines.
