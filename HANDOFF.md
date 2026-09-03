# HANDOFF — Session 233 (2026-09-02)

## Current State

**Aligner census done, no product code changed.** Fega asked, before #357, whether a free voter
(or a different SET of voters) beats the shipped median-of-three. Answer in study §10
(`tasks/specs/subtitle-timing-learning-2026-09-02.md`): 14 free-to-sell aligners run over the
121 clips, all 4,943 subsets ≤5 scored + split-half. Winning structure = raw + one
wav2vec2/HuBERT + **Vosk** + **Parakeet** = 86.8% (shipped 84.6%, CrisperWhisper set 86.1%).
raw + Vosk + Parakeet = 84.7% with NO torch in the runtime. Ceiling ≈ 87%; no 90% exists.
#357 has a comment with the four options; **Fega has not picked yet.**

## Key Decisions

- Vote rule stays plain per-word median (trim = same, gate80 loses a point, 5-7 voters no gain).
- Whisper-family voters (large-v3, distil, st_vad, st_align) are correlated with raw and LOWER
  every set — never add one as a voter.
- Parakeet/FastConformer are transcription timestamps, not forced alignment: terrible alone
  (68%/63%), useful only inside a median. Never use alone or as a fallback.
- Non-commercial models (CrisperWhisper, MMS, ctc-forced-aligner) stay out; AGPL tools too.

## Next Steps

1. Fega picks a set from §10c (torch-free 84.7% / +WhisperX 86.4% / +HuBERT-large 86.8%).
2. Then: port the pick into `tools/word_timing.py` (Vosk = grammar-pinned KaldiRecognizer on the
   16 kHz mic wav; Parakeet = sherpa-onnx OfflineRecognizer, words from ▁-tokens; bias-correct
   each on untouched words as today), run `score_production.py <scratch> median`, then rewrite
   #357's "done means" around the chosen packages (vosk + sherpa-onnx wheels, model folders next
   to the whisper model, int8 Parakeet).
3. Vosk custom-words list for gaming vocabulary (4.2% unknown → raw).
4. #358 (transcribe stderr → pipeline log), word ENDS not re-timed (s232 note), backlog.

## Watch Out For

- All voter dumps (`align/<voter>/`) + audio + dataset live in THIS session's scratchpad
  (`22638acc-...`); copy forward, don't regenerate (Parakeet/Vosk/HuBERT runs ≈ 7 min each).
- Halves A/B are uneven (2170/1184 words, md5 of clipId) — fine for a sanity check, not a CV.
- Word matching = normalized text + nearest start within 1.5 s; repeated words can mis-pair.
- `combo2.py` even-count votes = mean of the middle two; 4-voter sets are NOT strict medians.
- sherpa-onnx models were launched mid-extraction once (error 13) — wait for `tar` to finish.

## Logs/Debugging

- Voter runtimes: whisper venv `D:\whisper\betterwhisperx-venv` (CTC backbones via
  `ctc_run.py <S> <tag> <model>`, `st_run.py`), `D:\whisper\aligners-venv` (`vosk_run.py`,
  `sherpa_run.py <S> parakeet|fcctc`); models in `D:\whisper\vosk-models`, `D:\whisper\sherpa-models`,
  torch hub `~/.cache/torch/hub/checkpoints`, HF `D:\whisper\hf_cache`.
- Scoring: `combo2.py <S> v1,v2,... [maxk] [top] [median|trim|gateNN]`; `compare.py <S> "a+b" "c+d"`
  for tolerances/positions; `score_production.py` for the real function. `PYTHONIOENCODING=utf-8`.
- Logs in scratchpad: `ctc_log.txt`, `st_log.txt`, `vosk_log.txt`, `parakeet_log.txt`,
  `combo_full13.txt` (the full table), `combo_trim.txt`, `combo_gate80.txt`.
