# Subtitle timing: what Fega's 129 approved clips teach us (2026-09-02, s231)

Fega's ask: "look at all my approved clips and learn from them ... subtitles appear too early,
are misaligned, in 3-word pills the first word swallows the pill and pushes the other two to the
last frames. I don't want to ever have to work on subtitles again."

This document is the measurement. Scripts live in `tasks/spikes/subtitle-timing/`.

## 1. Dataset

- 43 projects, 623 clips, **129 approved**; 121 of them carry both a per-clip stable-ts
  transcription (`clip.transcription`, the raw input) and Fega's saved edits
  (`clip.subtitles.sub1`, `_format: source-absolute`, the ground truth).
- 2,074 saved pills / 4,150 saved words. 3,354 words match a raw stable-ts word by text within
  1.5 s; the rest are retyped words, caps emphasis, or words pulled in by a clip extend.
- Mic audio (track 2, `-map 0:a:1`, the same track the app transcribes) extracted for all 121
  clips to score audio-based rules.

"Moved" below means Fega's final start is more than 150 ms later than raw; "untouched" means
within 50 ms of raw.

## 2. Findings

### 2a. The raw stable-ts word starts are already "Fega-perfect" for ~78% of words

| Metric (word start, Fega final vs raw stable-ts) | Value |
|---|---|
| within 100 ms | 78.4% |
| within 200 ms | 89.4% |
| moved later > 150 ms | 254 words (7.6%) |
| moved earlier > 150 ms | ~3% |

The app's cleanup passes on top of that (`cleanWordTimestamps` Pass 1-4, `segmentWords` linger
and gap closing) neither help nor hurt overall (78.5% vs 78.1% with Pass 4 removed). They do
shuffle 4.6% of good first words and 5.8% of good inner words by >100 ms, and "accidentally fix"
4.7% of the early first words. Net: a wash. Pass 4's coverage heuristic fires on 40% of raw
segments (486 of 1,344) because stable-ts words are short (median 120 ms) with real gaps
(median 100 ms), so "words cover <60% of the segment" is normal speech, not a broken segment.

### 2b. THE bug: the first word of a pill starts too early (this is "appears early" AND "first word swallows the pill")

| First words of Fega's pills | n |
|---|---|
| total matched | 1,380 |
| Fega moved the start later by > 150 ms | 194 (14%) |
| median amount moved | +0.37 s (p90 +0.70 s) |

The words Fega had to move look nothing like the ones he left alone:

| | moved first words | untouched words |
|---|---|---|
| raw word duration (median) | 0.40 s | 0.13 s |
| silence before the word (median) | 0.22 s | 0.09 s |
| Fega's new start relative to the raw END | -0.07 s (p25 -0.19, p75 +0.09) | n/a |

Rate at which Fega moved a first word, by its raw duration: <0.3 s: 3%, 0.3-0.5 s: 26%,
0.5-0.8 s: 42%, >0.8 s: **71%**. A long first word after a pause is almost always wrong.

Spectrograms (`examples.png` in the s231 scratchpad) show what happens: stable-ts's `refine()`
stretches the first word of an utterance backwards over the previous word's tail, a breath, or
the pause. The word's raw span [start, end] sits mostly on silence or on the previous word and the
real onset is a sharp silence-to-speech edge just before the raw end. Because the pill appears at
`words[0].start` and the karaoke highlight sits on word 1 until word 2's start, the pill shows
during silence with word 1 lit for half a second, then words 2 and 3 flash at the end. That is
the reported symptom, exactly.

The same failure hits inner words far less (15 of 439 middle words, 26 of 836 last words moved).

By month the early-first-word rate rose: Feb 7%, Jul 11%, Aug 14% (OBS audio format changed
2026-07-21 to FLAC 6-track; Fega's tolerance may also have tightened).

### 2c. Fega's grouping (3-word chunking) is fine as it is

- The chunker reproduces 77.4% of Fega's pills exactly (1,298 of 1,676 inside the transcription
  range). His changes are 323 splits vs 121 merges, mostly not at a pause or punctuation
  (147 of 195 split points have no gap and no comma): "to do | something,", "the way | he rolls",
  "was on | my mind,", stressed long words alone in a pill.
- Every rule variant tried (pronouns/possessives/auxiliaries as forward connectors, flush on a
  1-word chunk, max 2 words) reproduced FEWER of his pills (52-77%). Leave `segmentWords` alone.

### 2d. Linger and gaps are already what he wants

- When the next pill is >0.6 s away, Fega's pill ends 0.40 s (median) after the last raw word:
  identical to `LINGER_DURATION = 0.4`. 46% of his ends sit in the 0.3-0.5 s band.
- When the next pill is close, he leaves gap 0 in 89% of cases: matches the gap-closing rule.

### 2e. Small real bug: reopening an edited clip can still re-time a saved word

`resolveClipSubtitles` runs `mergeWordTokens -> validateWords -> cleanWordTimestamps` on
editor-saved sub1 too (the other artifact cleanups are gated by `hasEditorSavedSubs`, this one is
not). On the 121 clips: 9 saved word starts and 17 ends move by >20 ms on reload (13 pills of
2,121), e.g. "to finally see": saved 22.25 -> 22.01 after reload. Rare, but it silently undoes a
hand fix. Fix: skip `cleanWordTimestamps` (and `validateWords` clamping) when
`hasEditorSavedSubs`.

## 3. What fixes 2b

### 3a. Silence-edge snap (audio rule, no model) — scored on all 121 clips

Rule C: for a word whose raw duration is >0.3 s, look inside [raw start, raw end] for the LAST
quiet run (frames below max(noise floor + 6 dB, local peak - 18 dB) for >= 60 ms) that is followed
by speech; move the start to the end of that run (minus 20 ms). Otherwise leave the word alone.

| | early first words (n=194) | untouched first words (n=1,186) | all words |
|---|---|---|---|
| raw | 0% within 100 ms | 100% within 100 ms | 78.4% |
| Rule C | 46-53% within 100 ms, 70% within 200 ms | 96-97% (3-4% collateral >100 ms) | 79.5% |

Where it lands, it lands well (median error -24 ms). The 87 it cannot fix are words whose raw
span has no quiet inside it: the word bleeds over the previous word's tail with continuous
voicing, or the whole raw span is on silence and the real word is AFTER the raw end (Fega's start
is +0.07 s past the raw end, median). Energy cannot separate those; only an aligner can.

### 3b. Alternative aligners (full-data numbers in section 4)

WhisperX (wav2vec2 CTC forced alignment of the same text), stable-ts `align()`, stable-ts with
silero VAD, and stable-ts `adjust_by_silence` were each run on all 121 clips and scored the same
way. See section 4.

## 4. Aligner comparison

Same text re-aligned per clip; scored against Fega's final starts. "early first" = the 194
first words he moved; "untouched" = the 2,321 words he left within 50 ms of raw.

| Method | early first words fixed (<=100 ms) | untouched words disturbed (>100 ms) | all words <=100 ms |
|---|---|---|---|
| raw stable-ts (what the app gets today, before its cleanup) | 0% | 0% | 78.4% |
| current app pipeline (raw + cleanWordTimestamps + segmentWords) | 4.6% | 5.7% first / 7.1% inner | 77.1% |
| stable-ts `align()` of the known text (121 clips) | 23% | 34% / 18% | 65% |
| stable-ts transcribe with silero VAD + refine (121) | 14% | 15% / 8% | 73% |
| stable-ts + refine + `adjust_by_silence(vad)` (36 clips, job stopped) | 19% | 10% / 5% | 80% |
| WhisperX wav2vec2 forced alignment (121) | **58%** (76% within 200 ms) | 21% / 17% (median bias +31 ms) | 76% |
| **Rule C** silence-edge snap, gated raw dur > 0.3 s (121) | 44% | 2.9% / 2.1% | 79.5% |
| Rule C, else WhisperX (bias-corrected) when dur > 0.3 and later by > 0.1 s | 54% | 4.6% / 3.1% | 79.5% |
| **Rule C only where WhisperX agrees within 150 ms; else WhisperX when dur > 0.4 and later by > 0.15 s** | 45% | **1.8% / 1.1%** | **80.2%** |

No full replacement beats the raw stable-ts timings overall. The gains come from touching ONLY
the suspicious first words (long raw duration) and leaving everything else exactly as stable-ts
produced it.

## 5. Recommendation (needs Fega's go-ahead — no code written this session)

Three changes, all scorable against this dataset before shipping:

1. **Stop the app's own cleanup from moving good words.** In `resolveSubtitles.js` drop the
   `cleanWordTimestamps` anchor pass for stable-ts input (Pass 4 coverage heuristic) and skip the
   whole word-repair step for editor-saved sub1 (`hasEditorSavedSubs`) so a reopen never re-times
   a hand fix (2e). Expected: 0% of untouched words disturbed instead of 6-7%; overall 78.4%.
2. **Snap suspicious first words to the silence edge in `tools/transcribe.py`**, where the audio
   is already loaded (replaces the weak +/-150 ms `find_nearest_speech_onset`). Rule C as scored:
   raw duration > 0.3 s, last quiet run >= 60 ms below max(noise5 + 6 dB, peak - 18 dB), start =
   run end - 20 ms. Expected: roughly half of the early-first-word pills fixed, 2-3% of long good
   words nudged (median nudge ~0.1 s), overall 79.5%.
3. **Optional second opinion: WhisperX alignment of the same text, gated by agreement** (the
   last table row). The venv already has whisperx + the wav2vec2 model; ~1.4 s per clip on the
   3090. Lowers collateral to 1-2% and lifts overall to 80.2%. More moving parts (a second model
   on customer machines, see #146), so this is the row to decide on, not a default.

What this does NOT do: the ~45% of early first words where the raw span has no quiet inside it
(word bleeds over the previous word with continuous voicing, or the whole span is on silence and
the word is after it). Those need a better aligner than anything tested here. Candidates to score
next, each a model download: CrisperWhisper (trained for exact word boundaries and pauses),
Montreal Forced Aligner / NeMo forced aligner on the known text. Until one scores > 80% on the
early set without disturbing the rest, some pills will still need the editor.

Not recommended: any change to `segmentWords` chunking or `LINGER_DURATION` (2c, 2d).

## 6. Correction: it is not only the first word (Fega's pushback, same session)

Section 2b counted a word as "moved" only when Fega pushed it LATER. Counting both directions
(|Fega - raw| > 100 ms) changes the picture:

| position in the pill | n | off > 100 ms | pushed later | pulled earlier |
|---|---|---|---|---|
| first | 1,100 | 19.7% | 13.3% | 6.5% |
| middle | 547 | 15.0% | 7.3% | 7.7% |
| last | 1,093 | 21.6% | 6.1% | **15.5%** |
| single-word pill | 614 | 30.6% | 14.7% | 16.0% |

Of 486 three-word pills, 20% have the first word off, 29% have a middle or last word off, and
19% have an inner word off while the first word is fine. The last word is usually too LATE in
the raw output: the middle word stays lit until the last word finally fires ("the middle word
swallows the pill"). The silence-edge rule can only move a start later, so it does nothing for
these; WhisperX places inner words well (70% of the inner words Fega moved land within 100 ms).

Re-scored in both directions (all 121 clips):

| Method | first words Fega moved | inner words Fega moved | untouched disturbed (first / inner) | all words <= 100 ms |
|---|---|---|---|---|
| raw stable-ts | 0% | 0% | 0 / 0 | 78.4% |
| WhisperX bias-corrected, full replacement | 53% | 67% | 14% / 12% | 80.6% |
| silence-edge snap only | 22% | 2.5% | 2.9% / 2.1% | 79.6% |
| **shipped: WhisperX where it disagrees with stable-ts by > 150 ms, silence snap as tie-break** | 33% | 36% | 7.8% / 5.5% | **80.8%** |

## 7. What shipped (s231, after Fega's "do all 3")

- `resolveSubtitles.js`: editor-saved words pass through untouched (0 of 4,150 saved words
  change on reopen, was 26); fresh transcription no longer gets the anchored Pass 4.
- `tools/word_timing.py` (new) + `tools/transcribe.py`: `refine_word_timing` runs after the
  existing post-processing. WhisperX forced alignment of the same text is the second opinion
  (override when > 150 ms apart, after a +31 ms bias correction); the silence-edge snap applies
  to long words when WhisperX agrees with it. Without WhisperX the snap runs alone.
  Scored through the real function: 80.8% (WhisperX path), 79.6% (snap-only fallback).
- Customer machines: `tools/runtime/requirements.txt` does not install whisperx (only the
  constraints file pins 3.8.2) and the wav2vec2 model is a ~360 MB torch-hub download on first
  use, so customers get the snap-only path until #146's runtime adds both. Filed separately.
- CrisperWhisper (cc-by-nc-4.0, NON-commercial licence — usable for scoring, not for shipping
  without a licence from nyra health): downloaded (3.2 GB) and run over the clips; section 8.

## 8. CrisperWhisper (all 121 clips)

Runs only on its own transformers fork (`D:\whisper\crisper-tf-fork`, 4.37-based, with
tokenizers 0.15.2 beside it, `sys.modules["torchcodec"]=None`, venv numpy/torch imported first).
~15 s per clip on the 3090. It transcribes verbatim (every "ha,", every filler), so 331 of 3,354
words did not match Fega's text by nearest-word matching; those count as "left at raw" below.

| Method | first words Fega moved | inner words Fega moved | untouched disturbed (first / inner) | all words <= 100 ms |
|---|---|---|---|---|
| CrisperWhisper alone, matched words only (n=3,023) | **73%** | **77%** | 19.5% / 9.0% | **83.5%** |
| CrisperWhisper alone, unmatched left at raw (n=3,354) | 58% | 68% | 18% / 8.4% | 81.6% |
| CrisperWhisper where it disagrees with stable-ts by > 150 ms | 40% | 33% | 9.3% / 3.0% | 81.7% |
| ... and WhisperX agrees with it within 150 ms | 27% | 30% | 3.2% / 2.4% | 82.5% |
| shipped (WhisperX second opinion, section 6) | 33% | 36% | 7.8% / 5.5% | 80.8% |

Reading: CrisperWhisper is the best single aligner tested and the first one whose stand-alone
timing beats raw stable-ts overall. But every aligner, including this one, still disagrees with
Fega on ~17-20% of words — and they disagree with EACH OTHER on those same words (three
independent aligners each land within 100 ms of him ~80% of the time). The residual is not a
missing tool; it is the band where Fega's ear, not the acoustics, decides where the pill fires.
So: (a) the shipped rule stands, (b) CrisperWhisper would add roughly one point at the cost of a
non-commercial licence and a 3 GB model — worth revisiting only with a licence, (c) the honest
ceiling for automatic timing on this data is ~82-83% of words within 100 ms; after that the
remaining fixes are taste and belong in the editor.

## 9. Session 232 (same day): the whole pill, the grouping, and a third aligner

Fega's follow-up: "besides the first word, the same thing happens for the middle and the third
words — and look at how I combine words, sometimes you group them weirdly." Everything below is
scored on the same 121 clips (`tasks/spikes/subtitle-timing/`: `group_exp.py`, `group_model.py`,
`chunk_exp2.js`, `qwen_run.py`, `combo.py`, `score3.py`, `score_production.py median|qwen`).

### 9a. Where Fega's words differ from raw stable-ts, by position and direction

| position | n | off > 100 ms | pushed later | pulled earlier | raw duration of the moved word (median) |
|---|---|---|---|---|---|
| single-word pill | 614 | 30.6% | 14.7% | 16.0% | later: 0.41 s, earlier: 0.07 s |
| first of 2-3 | 1,100 | 19.7% | 13.3% | 6.5% | later: 0.42 s, earlier: 0.08 s |
| middle | 547 | 15.0% | 7.3% | 7.7% | |
| last | 1,093 | 21.6% | 6.1% | 15.5% | |

Two mirror-image defects, not one: a LONG raw word (stretched back over the pause) starts too
early; a TINY raw word (70-80 ms, after a 0.37 s silence) starts too late — stable-ts pushed
the real onset into what it called silence. The energy snap only handles the first kind.
Fega's pills are internally contiguous (94% of intra-pill word gaps are exactly 0, pill start =
first word start in 99.8%, pill end = last word end in 98.7%), so word STARTS are the whole
story for the karaoke; ends only matter for the last word's linger.

### 9b. Three aligners, one median

Qwen3-ForcedAligner-0.6B (Alibaba, Jan 2026, **Apache-2.0 code and weights**, `pip install
qwen-asr`, 1.8 GB in the HF cache, 0.13 s/clip on the 3090, **10x realtime on CPU**) was run over
the 121 clips. Alone it is worse than raw (75.5%, 19% of good words disturbed, and it collapses
"ha ha ha" into zero-length words). But the three aligners miss DIFFERENT words:

| Method (word start within 100 ms of Fega) | all | moved later | moved earlier | untouched disturbed | single/first/mid/last moved fixed |
|---|---|---|---|---|---|
| raw stable-ts | 78.4% | 0% | 0% | 0% | — |
| WhisperX alone (bias +31 ms) | 80.6% | 62% | 57% | 13.1% | 47/58/70/67% |
| Qwen alone (bias -15 ms) | 76.8% | 60% | 62% | 18.8% | 65/59/66/59% |
| CrisperWhisper alone (cannot ship) | 81.6% | 58% | 66% | 13.3% | 54/61/65/69% |
| shipped s231: WhisperX where > 150 ms from raw | 81.2% | 37% | 34% | 6.5% | 31/39/27/39% |
| **median(raw, WhisperX, Qwen)** | **84.6%** | **50%** | **54%** | **6.5%** | **47/49/61/56%** |
| median of all four incl. CrisperWhisper | 86.1% | 56% | 64% | 6.8% | 54/56/70/67% |

Through the real `refine_word_timing` (`score_production.py median`): **84.1%** of all words,
44.9% of the first words and 56.6% of the inner words Fega had to move now land, 7.6% / 5.6% of
untouched words shift. That is above the "82-83% ceiling" written in section 8: the ceiling was
for one aligner; a vote of three independent ones is a different estimator. Single-aligner
fallbacks: WhisperX-only 80.8% (unchanged); Qwen-only scores 78.9% through the harness, below the
snap-only 79.6%, so a machine with Qwen but no WhisperX uses the snap.

### 9c. Grouping: the chunker is at its ceiling, two small knobs help

Junction study (every word-to-next-word junction present in both Fega's pills and the chunker's,
n = 2,998): boundary precision 92.4%, recall 86.5%; 1,252 of 1,612 pills (77.7%) reproduced
exactly. A logistic-regression junction model on words + POS tags + gaps (grouped 5-fold CV by
clip) scores F1 80% alone and 89.4% with the chunker's own decision as a feature vs the
chunker's 89.3%: the remaining 10-13% of boundary disagreements are not predictable from local
features (Fega himself splits "what the heck" two different ways in two clips). What the
disagreements look like: he starts pills at phrase heads the chunker fills past ("was on | my
mind", "the way | he rolls", "get him out | of here") and isolates vocatives ("come on | man |
come on | baby"). Scored variants (exact pills / boundary F1, raw timings):

| variant | exact | F1 |
|---|---|---|
| chunker as shipped (s231) | 77.7% | 89.4 |
| vocatives (man/bro/dude/guys/bruh) isolated like fillers | 78.7% | 89.8 |
| FORWARD_LOOK_GAP 0.5 → 0.4 | 78.2% | 89.7 |
| **both (shipped s232)** | **79.2%** | **90.1** |
| interjections isolated / possessives or pronouns as forward connectors / MAX_CHARS 16 or 24 / no atomic phrases / no known-phrase recall | 74-78% | 87-89 |

On the median-refined timings the same pair scores 78.2% vs 77.0% for the old chunker. Fega's
pill sizes are 1:2:3 = 36/35/30% (13 four-word pills in 2,074): MAX_WORDS 3 stands.

### 9d. Shipped in s232

- `tools/word_timing.py`: Qwen3-ForcedAligner as a third opinion; word start = median of
  {stable-ts, WhisperX, Qwen}; WhisperX alone → gated rule + snap tie-break; otherwise snap.
- `segmentWords.js`: vocatives in FILLERS, FORWARD_LOOK_GAP 0.4.
- Customer runtime (#357) now needs `qwen-asr` + the 1.8 GB model as well as whisperx.

## 10. Session 233: every free-to-sell aligner, every combination

Fega's question: is there a free voter (or a different SET of voters) that beats the shipped
median-of-three, before #357 packages the current set into the customer runtime? Method: run
each candidate over the same 121 clips (`tasks/spikes/subtitle-timing/ctc_run.py`, `vosk_run.py`,
`sherpa_run.py`, `st_run.py`), then `combo2.py` scores EVERY subset of up to 5 voters (plain
per-word median, bias-corrected on untouched words) on all clips and on two clip halves (pick on
one half, read the other) so a winner is not a lucky fit. `compare.py` re-reads the finalists at
50/150/200 ms and per pill position.

### 10a. Candidates (licence checked on the package / model card, not from memory)

| voter | what it is | licence | download | alone (<=100 ms) | untouched disturbed |
|---|---|---|---|---|---|
| raw | stable-ts as transcribed (large-v3-turbo) | MIT | shipped | 78.4% | 0% |
| whisperx | wav2vec2 BASE 960h CTC forced alignment (shipped s231) | BSD-2 / weights BSD | 378 MB | 80.6% | 13.1% |
| qwen | Qwen3-ForcedAligner-0.6B (shipped s232) | Apache-2.0 | 1.8 GB + `qwen-asr` | 76.8% | 18.8% |
| **vosk** | Kaldi GMM/HMM recogniser, grammar pinned to the transcript (`vosk-model-en-us-0.22-lgraph`) | Apache-2.0 | 205 MB model + 52 MB pip, CPU only, no torch | **83.0%** | 12.3% |
| hubert_l | HuBERT-large CTC via torchaudio, through whisperx.align | MIT (fairseq) | 1.2 GB | 82.1% | 12.2% |
| hubert_xl | HuBERT-xlarge CTC | MIT | 3.9 GB | 82.3% | 12.5% |
| wx_large960 | wav2vec2 LARGE 960h CTC | MIT | 1.2 GB | 81.8% | 12.7% |
| wx_lv60k | wav2vec2 LARGE LV60k CTC | MIT | 1.2 GB | 81.6% | 12.6% |
| lv60_self | facebook/wav2vec2-large-960h-lv60-self (HF) | Apache-2.0 | 1.2 GB | 80.3% | 14.8% |
| robust_swbd | facebook/wav2vec2-large-robust-ft-swbd-300h (conversational) | Apache-2.0 | 1.2 GB | 80.7% | 13.3% |
| xlsr_en | jonatasgrosman/wav2vec2-large-xlsr-53-english | Apache-2.0 | 1.2 GB | 79.2% | 14.5% |
| parakeet | NVIDIA parakeet-tdt-0.6b-v2 via sherpa-onnx, free transcription, token timestamps | CC-BY-4.0 (attribution) + Apache-2.0 runtime | 1.2 GB fp16 (600 MB int8), CPU, no torch | 67.8% | 28.5% |
| fcctc | NVIDIA FastConformer-CTC via sherpa-onnx | CC-BY-4.0 | 438 MB | 62.9% | 32.5% |
| crisper | CrisperWhisper (reference only) | **CC-BY-NC — cannot ship** | 3 GB | 81.6% | 13.3% |
| st_v3 / st_distil | stable-ts with large-v3 / distil-large-v3 backbones | Apache / MIT | — | see 10d | |

Rejected without running: Meta MMS forced aligner and the popular `ctc-forced-aligner` package
(both CC-BY-NC), whisper-timestamped and aeneas (AGPL), Montreal Forced Aligner (MIT but conda-only,
no way to ship it inside the runtime), NeMo toolkit itself (Windows install; sherpa-onnx carries
the same models as ONNX).

### 10b. Combinations (plain median, all 121 clips; half A / half B in the last columns)

| vote set | all words <=100 ms | moved words fixed | untouched disturbed | A | B |
|---|---|---|---|---|---|
| shipped s232: raw+whisperx+qwen | 84.6% | 52% | 6.5% | 84.7% | 84.0% |
| raw+whisperx+qwen+crisper (the "cannot ship" 86%) | 86.1% | 60% | 6.8% | 86.0% | 86.1% |
| **raw+hubert_l+vosk+parakeet** | **86.8%** | 63% | 6.8% | 86.8% | 86.9% |
| raw+lv60_self+vosk+parakeet | 86.9% | 63% | 6.7% | 86.8% | 87.1% |
| raw+<any other large wav2vec2>+vosk+parakeet | 86.6% | 63% | 6.9% | | |
| raw+whisperx+vosk+parakeet (keep the shipped wav2vec2, add two, drop Qwen) | 86.4% | 62% | 6.9% | 85.8% | 87.7% |
| raw+whisperx+qwen+vosk+parakeet (add two to the shipped three) | 86.2% | 67% | 8.6% | 86.3% | 86.6% |
| raw+vosk+parakeet (NO torch at all) | 84.7% | 55% | 7.3% | 84.1% | 86.2% |
| raw+vosk (two voters = mean) | 84.2% | 38% | 3.0% | 84.4% | 83.8% |
| best of 4,943 subsets incl. crisper: raw+robust_swbd+vosk+crisper | 86.9% | 65% | 6.9% | 86.9% | 86.9% |

Reading:
- **The structure that wins is raw + one wav2vec2/HuBERT CTC aligner + Vosk + Parakeet.** Which
  CTC backbone barely matters (86.4-86.9%, noise). The two new voters are the gain: Vosk is a
  different technology (HMM, no neural net) and the best single voter of all; Parakeet is awful
  alone (token-emission times, 28% disturbance) but its errors are uncorrelated with everyone
  else's, so it helps inside a median.
- Votes of 5-7 do not beat votes of 4 (best 6-voter 86.7%). Trimmed mean = median; a "only move
  if the vote differs from raw by > 80 ms" gate LOSES ~1 point. Plain median stays.
- The honest ceiling is ~87%, with or without CrisperWhisper: the best of all 4,943 subsets
  including the non-commercial model is 86.9%, the best free set is 86.8-86.9%. There is no 90%
  in this family; the residual is the taste band described in section 8.
- The picture holds at other tolerances (raw+hubert_l+vosk+parakeet vs shipped: 93.5% vs 92.1%
  at 150 ms, 96.0% vs 94.2% at 200 ms) and in every pill position (single 78/76, first 89/85,
  mid 90/91, last 88/85). Clips with >=90% of words right: 50/114 vs 36/114.

### 10c. What it means for #357 (decision for Fega)

Three shippable options, by cost:

1. **raw + Vosk + Parakeet — 84.7%, same as today, NO torch/whisperx/Qwen in the runtime.**
   Two pip packages (vosk 52 MB, sherpa-onnx 28 MB + onnxruntime) and two model folders
   (205 MB + 600 MB int8). Both run on CPU in ~2-3 s per 25 s clip. The whole wav2vec2/Qwen
   dependency chain (torchaudio, transformers, qwen-asr with gradio/fastapi, 2.2 GB of weights)
   disappears from #357.
2. **raw + WhisperX (as shipped) + Vosk + Parakeet — 86.4%.** Option 1 plus the already-shipped
   whisperx path; Qwen and its 1.8 GB go. Cheapest way to the ~86% tier.
3. **raw + HuBERT-large + Vosk + Parakeet — 86.8%.** Option 2 with the 378 MB base wav2vec2
   swapped for the 1.2 GB HuBERT-large (same whisperx.align code, `model_name="HUBERT_ASR_LARGE"`).
   +0.4 over option 2 for +0.9 GB; within noise on the half-split.

Not done this session: the winner has not been run through the real `refine_word_timing`
(`score_production.py`), and Vosk's vocabulary misses gaming words ("3v1", "Fega", "fivefive" —
4.2% of words fall back to raw; a custom-words list would close some of that).

### 10d. Whisper-family voters are not independent enough

stable-ts with a different Whisper backbone (large-v3, transcribe + refine) scores 65.4% alone,
26% of untouched words disturbed, and LOWERS every set it joins (raw+hubert_l+vosk+parakeet+st_v3
86.0% vs 86.8% without it); distil-large-v3 is the same story (67.4% alone, 86.0% in that set). Cross-attention timing from any Whisper model shares raw's failure
mode (long words stretched over pauses), so it adds a correlated vote, not a new one. Same for
`st_vad` / `st_align` from s231. Only CTC aligners, the HMM recogniser and the transducer bring
independent evidence.

### 10e. Cost on the real 30-minute recording (Fega's 3090, 2026-08-31 MC Day2 Pt1, 1804 s, 505 segments, 3,732 words)

| step | time | note |
|---|---|---|
| stable-ts transcribe + refine (every option pays this) | 205 s | model load 7 s |
| shipped `refine_word_timing` on the FULL recording | 149 s cold / 95 s warm | **Qwen OOMs on 30 min of audio (asks for 74 GB) → method silently = whisperx+snap**, invisible because of #358. Clips (25 s) are unaffected and do get median3. |
| WhisperX base align alone | 32 s | |
| HuBERT-large align alone | 36 s | GPU: +4 s per 30 min. The "2x slower" was CPU-only (2.0 vs 4.1 s per 25 s clip). |
| Qwen alone (25 s clips) | 0.13 s/clip | fails on the full file |
| Vosk, full recording, 3,700-word grammar | 194 s CPU | per 25 s clip ≈ 2-3 s |
| Parakeet, full recording | crashes on 5-min chunks (bad alloc) | per 25 s clip ≈ 3 s; needs ≤ 60 s chunks |

Pipeline logs, like for like (30-min recordings): pre-upgrade alpha.20 (JC Day6 Pt1, 08-28)
transcription 253 s, 18-clip retranscription 76 s (4.2 s/clip), total 604 s. alpha.22 (MC Day2
Pt1, 09-02) transcription 274 s, 20-clip retranscription 138 s (6.9 s/clip), total 676 s.

Consequence for the port: **run the voters in clip retranscription only** (that is where
`clip.transcription`, the subtitle input, comes from) and drop `refine_word_timing` from the
full-recording pass (its words feed detection/SRT, never subtitles). That removes ~95-150 s from
the full pass and adds ~5-6 s per clip for Vosk + Parakeet, so a 20-clip run lands at about
today's total or below. Running Vosk/Parakeet over a 30-minute file would add 6-7 minutes and
must not happen.

### 10f. Session 234: the port, scored through the real function

`tools/word_timing.py` now votes raw + HuBERT-large (`HUBERT_ASR_LARGE` through `whisperx.align`)
+ Vosk + Parakeet with the TRUE median (even count = mean of the two middles); Qwen is gone.
Biases from the s233 dumps on untouched words, identical on both halves: HuBERT +25 ms, Vosk 0,
Parakeet +20 ms. Every ladder row below is `score_production.py <s233 scratchpad> <mode>` — the
production `refine_word_timing` on the 121 clips with live models in the engine venv
(`D:\whisper\betterwhisperx-venv` + vosk 0.3.45 + sherpa-onnx 1.13.7, Parakeet fp16, 3090).

| voters available → method | all ≤100 ms | first moved | inner/last moved | first untouched disturbed | inner/last untouched disturbed | time / 121 clips |
|---|---|---|---|---|---|---|
| **hubert+vosk+parakeet → median4 (ships)** | **86.1%** | 55% | 66% | 7.8% | 5.6% | 884 s |
| hubert+vosk → median3 | 85.1% | 48% | 65% | 7.8% | 6.4% | 568 s |
| vosk+parakeet → median3 (no torch) | 83.8% | 51% | 52% | 9.4% | 5.5% | 631 s |
| hubert+parakeet → median3 | 83.7% | 43% | 54% | 7.3% | 5.6% | 539 s |
| vosk → vosk+snap (gated) | 83.3% | 45% | 38% | 7.1% | 4.0% | 430 s |
| hubert → hubert+snap (gated) | 81.7% | 37% | 39% | 7.6% | 5.2% | 122 s |
| parakeet alone → snap (not trusted) | 79.6% | 23% | 3% | 2.9% | 1.9% | — |
| nothing → snap | 79.6% | 23% | 3% | 2.9% | 1.9% | 1 s |
| for reference: alpha.22 median3 (raw+whisperx+qwen), s232 | 84.1% | 45% | 57% | | | |

Reading:
- **86.1%, not the harness's 86.8%.** Feeding the production voting logic the identical s233
  dumps (`score_dumps.py`, s234 scratchpad) gives 86.2% with the production 1.0 s match window
  and 86.3% with the harness's 1.5 s; the live models add 0.1. The rest of the gap is that
  `combo2.py` matches every voter's word against Fega's FINAL position, while production matches
  against the transcript's — the harness is ~0.5-0.7 optimistic for every set (s232 saw the same
  0.5). The 1.5 s window and the "lone opinion = mean with raw" variant are each worth ≤0.1 (three
  words) and were not adopted. Relative ordering of the sets is unchanged.
- Vosk is the voter that carries the two-voter rows: both rows without it fall below the
  alpha.22 median3. HuBERT alone beats WhisperX-base alone (81.7% vs 80.8%). Parakeet alone is
  correctly routed to the snap.
- Per-clip cost warm on this machine: HuBERT 1.3 s (GPU), Vosk 3.0 s, Parakeet 1.6 s
  (fp16, 8 threads) — about 6 s per 25 s clip on top of stable-ts.
- **Correction to 10e's "never subtitles":** `resolveSubtitles.js` still reads
  `project.transcription` for a clip whose own retranscription failed, and for the audio a clip
  is EXTENDED into past its original range (extras merge). With `--word-timing` off on the full
  pass those words now carry raw stable-ts timing (78%) instead of the previous whisperx+snap
  (81%) until the clip is retranscribed. Surfaced to Fega; not changed.
- Unit tests: `tools/tests/test_word_timing.py` (median semantics, ladder selection with stubbed
  voters, Parakeet chunk offsets, `_enforce_order`) — `python -m unittest`, any venv with numpy.

### 10g. Session 236: Parakeet int8, and the full-recording words (#360)

**Parakeet int8 ships.** `score_production.py <s233> median` with `CORVA_PARAKEET_MODEL` on
`sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8` (631 MB unpacked, 661 MB zip on R2): **86.0%**
all-words (fp16 86.1%; first moved 55.1% / inner-last moved 66.7% / untouched disturbed 8.0% /
5.7%). Inside the 0.3 tolerance, half the download of fp16. The engine manifest now lists three
models.

**The full-recording words were worse than assumed.** `score_production.py` gained `FULLPASS=1`
(score `projTranscriptionSegs` — the full 30-min pass's words shifted to the clip range, what
`resolveSubtitles` reads for a failed retranscription or an extended clip) and a `raw` mode. On
the same 121 clips, same finals, same metric:

| full-recording words → method | all ≤100 ms | first moved | inner/last moved | first untouched disturbed | inner/last untouched disturbed | cost / 30 min (3090 + 8-thread CPU) |
|---|---|---|---|---|---|---|
| raw stable-ts (what #359 left) | 68.3% | 0% | 0% | 0% | 0% | 0 |
| snap | 74.0% | 32% | 3% | 2.8% | 1.2% | 1 s |
| **hubert → hubert+snap (ships, `--word-timing-light`)** | **77.0%** | 45% | 32% | 5.6% | 4.3% | **50 s GPU warm / 66 s cold (1.5 GB); 234 s warm / 267 s cold on CPU** |
| hubert+parakeet → median3 | 80.0% | 46% | 52% | 4.9% | 3.9% | +140 s CPU (chunked int8, 8 threads) → ~190 s |
| for reference: the clip's own retranscription, raw | 78.4% | | | | | |

Reading: the "raw 78%" in #360 was the CLIP number; words from the 30-minute pass start ten
points lower (68.3%) — Whisper's timing on a long file is simply worse than on a 25 s cut, and
that is what an extended stretch or a failed clip was showing. The pre-#359 whisperx+snap full pass
was never scored on these words, so "≥81%" in #360's done-means was a clip-number target; on
full-pass words HuBERT+snap lifts 68.3 → 77.0 (+8.7) for 50 s, and Parakeet would add three more
points for 140 s of CPU. Fega's budget was "~100 s"; HuBERT alone fits it, HuBERT+Parakeet
(~190 s) does not, so the light pass ships HuBERT-only with the Parakeet trade documented as a
one-line flip in `transcribe.py`. Vosk on the full file (194 s, §10e) is out.

Cost, like for like, MC Day2 Pt1 through the packaged 1.1.0 CUDA runtime (`transcribe.py`
single-file, model load included): with HuBERT+Parakeet light 453 s; with HuBERT-only light **302 s**
(run alone; the `[TIMING]` line moved 655 starts, snapped 20, 83 unmatched of 3,700). The same
harness put alpha.22 at ~361 s (212 s stable-ts + the 149 s silently failing Qwen refine) and its
pipeline log showed 274 s for the step, so the shipped full pass is faster than alpha.22 while its
words go from 68% to 77%.

**CPU cap.** A CPU-only machine pays 234-267 s for HuBERT on 30 minutes (this desktop's 8 threads;
the laptop will be slower), so `transcribe.py` `LIGHT_CPU_MAX_SEC = 600`: on CPU the light pass
runs HuBERT only for recordings up to 10 minutes (~90 s) and keeps the snap (74.0%) above that,
reporting `cpu_cap` in the `[TIMING]` line. Clip retranscription is unaffected (median4 everywhere).
