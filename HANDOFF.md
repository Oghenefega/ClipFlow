# HANDOFF — Session 232 (2026-09-02)

## Current State

**#356 round two built and pushed, NOT yet cut as an installer, NOT yet seen by Fega in the app.**
alpha.21 is still the installed daily driver. Fega's ask this session: "not only the first word —
middle and last words too, and look at how I group words." Study: `tasks/specs/
subtitle-timing-learning-2026-09-02.md` §9; scripts in `tasks/spikes/subtitle-timing/`.

Shipped in the repo:
- `tools/word_timing.py`: third opinion = Qwen3-ForcedAligner-0.6B (Apache-2.0, `qwen-asr`,
  installed in the whisper venv, model in `D:\whisper\hf_cache`); every word start = median of
  {stable-ts, WhisperX, Qwen}. Through the real function: **84.1%** of words within 100 ms
  (s231 rule 80.8%, raw 78.4%), 45% of first / 57% of inner words Fega used to move now land,
  7.6% / 5.6% collateral. Ladder: WhisperX alone → gated + snap (80.8%); Qwen alone is NOT used
  (78.9% < snap 79.6%); none → snap. Logs `[TIMING] {'method': 'median3', ...}`.
- `src/renderer/editor/utils/segmentWords.js`: vocatives (man/bro/dude/guys/bruh) isolated like
  fillers, `FORWARD_LOOK_GAP` 0.5 → 0.4. Exact pill reproduction 77.7% → 79.2%.

Verification done: 29/29 standalone chunker tests, jest suite green, `npm run build:renderer` ok,
dev-profile boot clean (0 errors, window revealed), all four `refine_word_timing` paths exercised
(median3 / whisperx+snap / snap / bogus-Qwen fallback). NOT done: a real transcription through the
app (needs a new recording or a Retranscribe click).

## Key Decisions

- **Median of three, not a gate.** Every single aligner (WhisperX, Qwen, CrisperWhisper) is
  worse than raw stable-ts on its own; the per-word median of three independent ones is what
  crosses the old "82-83% ceiling". Adding CrisperWhisper as a fourth voter would give 86.1%
  but its licence is non-commercial — revisit only with a licence from nyra health.
- **Grouping is at its ceiling.** A junction model (words + POS + gaps, grouped CV) cannot beat
  the chunker; Fega himself groups the same phrase differently in different clips. Only the two
  scored knobs shipped; possessives/pronouns as connectors, interjection isolation, MAX_CHARS
  changes all score lower. Don't retune the chunker by feel.
- Qwen alone is not a fallback (below the snap). Both aligners are needed for the 84% path.

## Next Steps

1. Cut an installer (alpha.22) so Fega's next recording goes through median3; ask him to judge
   pills on a FRESH clip (old clips keep their saved sub1). Proof = `[TIMING]` line in the log.
2. #357: customer runtime needs whisperx + wav2vec2 checkpoint AND `qwen-asr` + the 1.8 GB
   Qwen model (pre-download next to the whisper model). Check the `qwen-asr` dependency size
   (it drags gradio/fastapi/typer) — a slimmer path may be vendoring its
   `core/transformers_backend` + `inference` modules.
3. Word ENDS were not re-timed (only starts). Pill end = last word end + 0.4 s linger; raw ends
   were measured fine on average (s231 §2d). If Fega reports pills lingering wrong, score ends
   with the same harness (both aligners return ends).
4. Backlog from s228/s230 stands (#353 Batch B, #350, #297/#299, quick-wins).

## Watch Out For

- `tools/word_timing.py` ships via `build.extraResources`; verify it is in
  `dist/win-unpacked/resources/tools/` after the next build.
- Qwen loads with `device_map=device`; on a CPU-only machine it uses float32 (~10x realtime,
  2.5 s per 25 s clip). First use downloads 1.8 GB into `HF_HOME` (the app passes it).
- Qwen collapses adjacent repeated words ("ha ha ha" → zero-length) — harmless inside the
  median, dangerous if anyone ever uses it alone.
- The scoring "moved" sets changed between s231 (later-only) and s232 (both directions, all
  positions); compare like with like (`score3.py`, `combo.py` are the s232 versions).
- Word matching in every scorer = normalized text + nearest start within 1.5 s; repeated words
  can mis-pair.

## Logs/Debugging

- Whisper venv `D:\whisper\betterwhisperx-venv\Scripts\python.exe`; `HF_HOME=D:\whisper\hf_cache`
  for the Qwen model; `score_production.py <scratchpad> median|whisperx|qwen|snap` prints the
  five-line score (~140 s for median); `DUMP=1` writes `refined/<mode>/` for `repro_refined.js`.
- Grouping: `node repro.js <S>` → `auto_repro.json`; `node chunk_exp2.js <S> [auto_repro_median.json]`
  prints exact pills + boundary F1 per variant (the `baseline` row = segmentWords.js as on disk).
- `PYTHONIOENCODING=utf-8` for scripts printing clip titles.
- Dev boot: `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222`; kill with
  `taskkill //F //IM electron.exe`. Dev tokens are `{"accounts":{}}`.
