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
