# Lever 1 — Multi-Signal Pipeline Upgrade
## Spec v1

**Status:** Proposed  
**Author:** Research session 2026-04-18  
**Scope:** `extract_signals` pipeline stage + revised frame sampling + prompt changes

---

## Research Findings

Before any design decisions, here is what the code actually does today.

### Pipeline stages (ai-pipeline.js)

| # | Stage | What it does |
|---|-------|-------------|
| 0 | Probe | ffprobe source file |
| 1 | Create Project | mkdir + project.json |
| 2 | Extract Audio | ffmpeg → audio.wav |
| 3 | Transcribe | stable-ts (faster-whisper) → JSON with word-level timestamps |
| 4 | Energy Analysis | `energy_scorer.py` (D:\whisper\) → `energyJson` array + `claudeReadyText` string |
| 5 | Frame Extraction | ffmpeg extracts top-20 frames sorted by `peak_energy` descending |
| 6 | Claude API Call | LLM receives system prompt + claudeReadyText + base64 frames |
| 7 | Cut Clips | ffmpeg stream-copy each clip |
| 7b | Clip Retranscription | Re-run stable-ts on each short clip for accurate subtitles |
| 8 | Save Project | Persist project.json |

### energyJson format (output of energy_scorer.py)

One object per SRT segment:

```json
{
  "start": 45.2,
  "end": 47.8,
  "start_timestamp": "00:00:45",
  "end_timestamp": "00:00:47",
  "text": "oh my god let's go",
  "avg_energy": 0.712,
  "peak_energy": 0.891,
  "energy_label": "🔥 HIGH"
}
```

### claudeReadyText format

Plain text, one segment per block:

```
[00:00:45 → 00:00:47] [energy: 🔥 HIGH]
oh my god let's go
```

### How Claude receives data today

- **System prompt:** task definition, creator profile, game context, clip selection rules, boundary rules, output schema, few-shot examples (ai-prompt.js:buildSystemPrompt)
- **User message:** `claudeReadyText` (transcript + energy labels) + up to 20 base64 JPEG frames

Frame selection is purely energy-based: `energyJson` sorted by `peak_energy` descending, top 20 taken.

### A note on energy signal purity

ClipFlow requires users to route their microphone to a dedicated OBS track. The energy scorer reads only that track (`-map 0:a:1`). This means energy data is **always pure voice** — no game audio contamination — regardless of whether the content is gaming or just chatting. The "loud = important" bias is about gaming-hype archetypes dominating clip selection, not audio bleed.

### Subprocess spawn pattern

All Python tools are spawned via Node.js `spawn()` with:
- `-X utf8` flag + `PYTHONUTF8=1` env
- stdout/stderr captured as strings
- Output written to files, then read by Node after process exits
- Timeout: 600000ms (10 min)

**Hardcoded dev path risk:** `energy_scorer.py` is currently referenced at `D:\whisper\energy_scorer.py` (ai-pipeline.js:161) — not in the repo. Filed as [#68](https://github.com/Oghenefega/ClipFlow/issues/68). New signal scripts go in `tools/signals/` and resolve via `path.join(__dirname, '..', '..', 'tools', 'signals', '<script>.py')`.

### Frozen zones

Per CLAUDE.md, **these are not touched**: publishing pipeline, render pipeline, queue. Signal extraction modifies stages 4.5–5 only — well inside the unfrozen zone.

---

## Architecture

```
Stage 3: Transcription ──────────────────────────────────────────┐
         (transcription JSON with word-level timestamps)          │
                                                                  ▼
Stage 4: Energy Analysis ─────────────────────────────── extract_signals (Stage 4.5)
         (energyJson + claudeReadyText)                          │
                                                                  │  ┌──────────────────────────┐
                                                                  ├─▶│ yamnet_events.py         │
                                                                  │  │ (Python subprocess)      │
                                                                  │  └──────────────────────────┘
                                                                  │  ┌──────────────────────────┐
                                                                  ├─▶│ pitch_spike.py           │
                                                                  │  │ (Python subprocess)      │
                                                                  │  └──────────────────────────┘
                                                                  │  ┌──────────────────────────┐
                                                                  ├─▶│ scene_change.py          │
                                                                  │  │ (FFmpeg subprocess)      │
                                                                  │  └──────────────────────────┘
                                                                  │  ┌──────────────────────────┐
                                                                  ├─▶│ computeTranscriptDensity │
                                                                  │  │ (JS, in-process)         │
                                                                  │  └──────────────────────────┘
                                                                  │  ┌──────────────────────────┐
                                                                  ├─▶│ computeReactionWords     │
                                                                  │  │ (JS, in-process)         │
                                                                  │  └──────────────────────────┘
                                                                  │  ┌──────────────────────────┐
                                                                  └─▶│ detectSilenceSpike       │
                                                                     │ (JS, in-process)         │
                                                                     └──────────────────────────┘
                                                                              │
                                                                              ▼
                                                                   buildEventTimeline()
                                                                   (merge all signals → eventTimeline JSON)
                                                                              │
                                                                  ┌───────────┴──────────┐
                                                                  ▼                      ▼
                                                         Stage 5: Frame Extraction   Stage 6: Claude
                                                         (composite score sort)      (eventTimeline in prompt)
```

### Key design principles

1. **Signals run after Stage 4** — they need `wavPath` (audio.wav) and `energyJson`.
2. **Python subprocesses only for model/heavy-compute signals** (YAMNet, pitch, scene change). Pure-computation signals run as JS functions.
3. **Python subprocesses run concurrently** — YAMNet, pitch, and scene change are independent and can be dispatched via `Promise.all()`.
4. **Each signal writes its own JSON file** to `processing/signals/`. Main process reads after processes exit.
5. **Graceful degradation** — any signal that fails contributes zeros to composite scores. Pipeline never fails due to signal extraction.
6. **Works out of the box** — no extra setup required from the user. Every signal derives from the video file already being processed.

---

## Why No Chat Log Signal

Chat message-rate spikes are the strongest external predictor of clip-worthy moments — stronger than audio energy alone (Twitch engineering research, PogChampNet at Visor.gg achieved ~85% highlight accuracy using chat data). However, chat log integration is explicitly **not included** in this spec for two reasons:

1. **Requires non-default user action.** OBS chat logging isn't enabled by default. Exporting VOD chat logs from Twitch/YouTube requires a separate manual step. Building around an optional artifact means most users — especially small and newer creators — get a worse product unless they know to set this up.

2. **Small creators are the target.** ClipFlow is designed to work well even for a creator with 5 concurrent viewers. Chat volume at that scale is too sparse to produce meaningful signal. A creator needs consistent 50+ viewers for chat spikes to be reliable.

**Future consideration:** If ClipFlow ever builds a live recording companion (OBS plugin, browser extension), automatic chat capture becomes viable. At that point, chat spike should be the first signal added. Until then, the signals in this spec are designed to serve any creator regardless of audience size or platform habits.

---

## Per-Signal Module Design

All scripts live in `tools/signals/`. Each script:
- Takes `--audio <wav_path> --output <json_path>` (or `--video` where needed) CLI args
- Writes a JSON file on success
- Exits 0 on success, non-zero on failure
- Prints progress to stderr
- Respects `PYTHONUTF8=1` env var

---

### Signal 1: Audio Event Detection (YAMNet)

**File:** `tools/signals/yamnet_events.py`  
**Library:** YAMNet via TensorFlow Lite runtime  
**Model:** `yamnet.tflite` (~3.2 MB, downloaded from TFHub)

**Why it's first:** Fastest model-backed signal. ~10 seconds for a 1-hour recording. Covers a wide range of gaming and conversational audio events. Zero dependency on heavy ML frameworks.

**Output schema:**

```json
{
  "signal": "yamnet",
  "frame_duration_ms": 960,
  "classes_kept": [
    "Laughter", "Giggle", "Chuckle, chortle",
    "Screaming", "Shout", "Yell", "Whoop",
    "Cheering", "Applause", "Gasp", "Sigh", "Groan",
    "Gunshot, gunfire", "Explosion", "Alarm",
    "Music", "Silence"
  ],
  "frames": [
    { "t_start": 0.0, "t_end": 0.96, "scores": { "Laughter": 0.02, "Cheering": 0.01 } },
    { "t_start": 0.96, "t_end": 1.92, "scores": { "Laughter": 0.71, "Cheering": 0.04 } }
  ]
}
```

**pip deps:** `tflite-runtime==2.14.0` (Windows wheel, ~8 MB installed)  
**Why tflite-runtime not tensorflow:** TFLite is ~8 MB installed vs. 500+ MB for full TF.  
**Curated class list (17 classes):** Gaming-relevant subset from AudioSet's 521 classes. All others discarded during inference.  
**Audio prep:** Resample to mono 16kHz float32 inline with numpy. No librosa needed for YAMNet.  
**Runtime estimate:** ~3750 frames for 1hr × ~2ms/frame CPU = ~8–15 seconds.

**Laughter coverage note:** YAMNet covers Laughter, Giggle, and Chuckle/chortle natively. The dedicated `jrgillick/laughter-detection` library was evaluated and rejected — it is unmaintained since ~2021 with known install failures against modern PyTorch, and adds a ~50 MB model for segmentation precision that YAMNet already approximates at class level. YAMNet's laughter coverage is sufficient.

---

### Signal 2: Voice Pitch Spike (F0)

**File:** `tools/signals/pitch_spike.py`  
**Library:** `librosa.pyin()` — well-maintained, part of the standard audio ML stack  
**No additional model file needed.**

**Why pitch matters:** Excitement in speech isn't just loud — it's high-pitched and fast. When a streamer hits a clutch moment or laughs hard, their fundamental frequency (F0) rises 30–50% above their baseline. This is especially diagnostic for:
- **Chill/competitive streamers** who have moderate energy but real vocal expression
- **Just-chatting streamers** where volume is flat but pitch carries emotion
- **Whispered hype moments** — tensely quiet speech that rises before a yell

Pitch spike is completely independent of energy. A moment can be low-energy but high-pitch (nervous clutch) or high-energy but low-pitch (calm dominance). Together they tell a richer story.

**Algorithm:**

```python
# 1. Load audio as mono float32 at 22050 Hz
# 2. Compute pYIN fundamental frequency (F0) frame-by-frame
#    - fmin = librosa.note_to_hz('C2')  (~65 Hz — floor for adult speech)
#    - fmax = librosa.note_to_hz('C6')  (~1047 Hz — above yelling range)
#    - frame_length = 2048, hop_length = 512 (~23ms per frame at 22050 Hz)
# 3. Filter to voiced frames only (voicing_flag from pYIN)
# 4. Compute speaker baseline F0 = median of all voiced frames
# 5. Slide a 3-second window at 1-second steps:
#    - Compute mean F0 of voiced frames in window
#    - Flag windows where mean_F0 > baseline * 1.4 for >= 0.5s of voiced speech
# 6. Output flagged windows as events with score = mean_F0 / baseline (normalized, capped at 2.0)
```

**Output schema:**

```json
{
  "signal": "pitch_spike",
  "baseline_f0_hz": 142.3,
  "windows": [
    { "t_start": 45.0, "t_end": 48.0, "mean_f0_hz": 218.4, "score": 0.85, "is_elevated": true },
    { "t_start": 312.0, "t_end": 315.0, "mean_f0_hz": 267.1, "score": 1.0, "is_elevated": true }
  ]
}
```

**pip deps:** `librosa>=0.10` (already added for YAMNet prep work; no extra cost)  
**Runtime estimate:** ~20–40 seconds for a 1-hour recording on CPU.

---

### Signal 3: FFmpeg Scene Change

**File:** `tools/signals/scene_change.py`  
**Library:** FFmpeg (already a dependency — zero new deps)

**Why scene change matters:** Dramatic visual cuts — death screens, killcams, entering a new area, a sudden visual reveal — correlate with significant game events. For gaming streamers, a scene change + audio spike is a near-certain highlight candidate. For just-chatting, sudden cuts often indicate a reaction clip or screen share moment.

**Algorithm:**

```python
# Run FFmpeg with scene change filter:
# ffmpeg -i <video> -vf select='gt(scene,0.4)',showinfo -f null -
# Parse stderr for 'pts_time' lines where scene change threshold is exceeded
# threshold=0.4 catches major cuts; adjust if noisy (OBS fade transitions etc.)
```

**Output schema:**

```json
{
  "signal": "scene_change",
  "threshold": 0.4,
  "events": [
    { "t": 312.5, "score": 0.82 },
    { "t": 1847.1, "score": 0.94 }
  ]
}
```

**pip deps:** None. Pure FFmpeg.  
**Runtime estimate:** ~20–40 seconds for a 1-hour recording (FFmpeg processes video stream only, no audio decode needed).

---

### Signal 4: Transcript Density

**Implementation:** JS function `computeTranscriptDensity(transcription, windowSec = 5)` in `src/main/signals.js`  
**No Python, no subprocess, no model.**

**Algorithm:**

```js
// 1. Flatten word list from all segments
// 2. Slide a windowSec window at 1s steps
// 3. Count words in each window → words-per-second (wps)
// 4. Compute baseline = median wps across all windows
// 5. Flag windows where wps > baseline * 1.75
// 6. Return: { t_start, t_end, wps, baseline_wps, is_elevated }[]
```

Elevated word rate catches comedy rapid-fire delivery, arguments, tension-breaking storytelling, and information-dense explanations. Complements energy (volume) with verbal busyness.

---

### Signal 5: Reaction Word Detection

**Implementation:** JS function `computeReactionWords(transcription, windowSec = 5)` in `src/main/signals.js`  
**No Python, no subprocess, no model.**

**Why this matters:** Pure text analysis of the transcript. Gaming and just-chatting streamers have recognizable reaction fingerprints. These are zero-cost signals — a regex/keyword pass over the existing transcript JSON.

**Pattern sets:**

```js
const REACTION_PATTERNS = {
  // Explicit exclamations
  hype:      /\b(LET'S GO|LESGO|LFG|LET'S GOOO+|POGGERS|POGCHAMP)\b/i,
  shock:     /\b(WHAT(?:\s+THE)?|NO WAY|BRO|WAIT WHAT|OH MY GOD|OMG|WTF|HOW)\b/i,
  fail:      /\b(NOOO+|WHY|WHAT HAPPENED|I'M DEAD|I CAN'T)\b/i,
  clutch:    /\b(ALMOST|SO CLOSE|ONE SHOT|CLUTCH|LAST SECOND)\b/i,

  // Punctuation patterns (from transcript text)
  exclaim:   /!{2,}/,          // multiple exclamation marks
  questions: /\?{2,}/,         // multiple question marks (disbelief)
};

// Score: count pattern matches per window, normalize by window word count
// Flag windows where reaction_density > threshold (tuned empirically)
```

**Output:** same format as transcript density — rolling window scores.

**Why this is especially powerful for just-chatting:** Conversational streamers have flat audio energy during storytelling, but their language reveals the emotional peak. "wait what, are you SERIOUS?" is undetectable by energy alone but lights up reaction word detection.

---

### Signal 6: Silence-Then-Spike

**Implementation:** JS function `detectSilenceSpike(energyJson, silenceThresholdSec = 1.0, spikeMultiplier = 2.0)` in `src/main/signals.js`  
**No Python, no subprocess, no model.**

**Algorithm:**

```js
// Uses energyJson (already computed, per-second energy values)
// 1. Compute baseline = median energy across all segments
// 2. Walk seconds chronologically:
//    - Track run of "silent" seconds (energy < baseline * 0.25)
//    - If silence run >= silenceThresholdSec AND next second energy >= baseline * spikeMultiplier:
//      → Flag (silence_end, spike_second) as a silence-then-spike event
// 3. Return: { t_silence_start, t_silence_end, t_spike, silence_duration_sec, spike_energy }[]
```

Silence-before-spike is a narrative signal: setup anticipation, a jump scare, or the moment a clutch play resolves.

---

## Composite Score Formula

### Weights (archetype-aware)

Weights are not uniform across archetypes. A hype streamer's clips are best found by energy peaks; a chill streamer's best moments are found by pitch and reaction words. The `ARCHETYPE_WEIGHTS` map encodes this from day one — tuning values later only requires changing the config, not the formula logic.

```js
const ARCHETYPE_WEIGHTS = {
  hype: {
    energy: 0.55, yamnet: 0.15, pitch: 0.10,
    density: 0.05, reaction_words: 0.05, scene_change: 0.05, spike: 0.05
  },
  competitive: {
    energy: 0.35, yamnet: 0.15, pitch: 0.20,
    density: 0.10, reaction_words: 0.10, scene_change: 0.05, spike: 0.05
  },
  chill: {
    energy: 0.25, yamnet: 0.10, pitch: 0.25,
    density: 0.15, reaction_words: 0.15, scene_change: 0.05, spike: 0.05
  },
  variety: {
    energy: 0.40, yamnet: 0.15, pitch: 0.15,
    density: 0.10, reaction_words: 0.10, scene_change: 0.05, spike: 0.05
  },
};
// just_chatting uses chill weights — energy is pure voice, pitch and reaction words dominate
```

**These are initial estimates, not tuned values.** After 10+ sessions of feedback data per archetype, run a simple linear regression over `signal_boosts` vs. approved/rejected clip labels to calibrate.

### Per-segment boost calculation

```js
// yamnet_boost: max score for reaction classes (Cheering, Whoop, Shout, Yell, Screaming,
//               Applause, Gasp, Laughter, Giggle) across YAMNet frames overlapping this segment
yamnet_boost = max(yamnet_frames overlapping seg, max reaction class score)

// pitch_boost: max normalized score from pitch spike windows overlapping this segment
pitch_boost = max(pitch_windows overlapping seg, score, default: 0)

// density_boost: elevated word rate score for windows overlapping this segment
density_boost = max(density_windows overlapping seg, wps / (baseline_wps * 2), capped 0–1)

// reaction_words_boost: reaction density score for windows overlapping this segment
reaction_words_boost = max(reaction_windows overlapping seg, score, default: 0)

// scene_change_boost: 1.0 if a scene change event falls within ±2s of segment midpoint
scene_change_boost = scene_events.some(e => |e.t - seg.midpoint| < 2.0) ? 1.0 : 0.0

// spike_boost: 1.0 if a silence_spike event overlaps this segment
spike_boost = silence_spike_events.some(e => overlaps(e, seg)) ? 1.0 : 0.0
```

### Fallback weight redistribution

If a signal failed, its weight is redistributed proportionally to the remaining signals so the total stays 1.0. This keeps composite scores comparable across runs where signals partially failed.

---

## Unified Event Timeline JSON Schema

Written to `processing/signals/{videoName}.event_timeline.json`.

```json
{
  "version": 1,
  "video_name": "AR Day25 Pt1",
  "source_duration_seconds": 3612.4,
  "archetype": "hype",
  "signals_computed": ["energy", "yamnet", "pitch_spike", "scene_change", "transcript_density", "reaction_words", "silence_spike"],
  "signals_failed": [],
  "extraction_ms": {
    "yamnet": 8140,
    "pitch_spike": 28300,
    "scene_change": 22700,
    "transcript_density": 11,
    "reaction_words": 4,
    "silence_spike": 3
  },
  "events": [
    { "t_start": 45.2, "t_end": 48.0, "signal": "yamnet",           "score": 0.71, "label": "Laughter",         "metadata": {} },
    { "t_start": 46.0, "t_end": 49.0, "signal": "pitch_spike",      "score": 0.88, "label": "elevated_f0",      "metadata": { "mean_f0_hz": 218.4, "baseline_f0_hz": 142.3 } },
    { "t_start": 312.5,"t_end": 312.5,"signal": "scene_change",     "score": 0.82, "label": "scene_cut",        "metadata": {} },
    { "t_start": 310.0,"t_end": 315.0,"signal": "transcript_density","score": 0.74,"label": "elevated_word_rate","metadata": { "wps": 4.2, "baseline_wps": 2.4 } },
    { "t_start": 310.0,"t_end": 315.0,"signal": "reaction_words",   "score": 0.91, "label": "hype_language",    "metadata": { "matches": ["LET'S GO", "OH MY GOD"] } },
    { "t_start": 118.0,"t_end": 119.0,"signal": "silence_spike",    "score": 1.0,  "label": "silence_then_spike","metadata": { "silence_duration_sec": 2.1, "spike_energy": 0.94 } }
  ],
  "segments": [
    {
      "start": 45.2, "end": 47.8,
      "start_timestamp": "00:00:45", "end_timestamp": "00:00:47",
      "text": "oh my god let's go",
      "avg_energy": 0.712, "peak_energy": 0.891, "energy_label": "🔥 HIGH",
      "composite_score": 0.921,
      "signal_boosts": {
        "yamnet": 0.71, "pitch_spike": 0.88, "scene_change": 0.0,
        "density": 0.0, "reaction_words": 0.91, "spike": 0.0
      }
    }
  ]
}
```

---

## Revised Frame Sampling Algorithm

**Current:** Sort `energyJson` by `peak_energy` descending, take top 20.

**Proposed:** Sort `segments` by `composite_score` descending, take top N (20 default).

Frame extraction logic (extractTopFrames) is otherwise unchanged — same FFmpeg call, same midpoint timestamp, same output format. The only change is the sort key.

**Backward compatibility:** If `eventTimeline` is null (signal extraction failed entirely), fall back to `peak_energy` sort — identical to current behavior.

---

## Prompt Changes (ai-prompt.js)

### buildUserContent() — new `eventTimeline` parameter

```js
// New signature:
function buildUserContent({ claudeReadyText, frames, eventTimeline })

// New content block inserted between claudeReadyText and frames:
if (eventTimeline?.events?.length > 0) {
  const top = eventTimeline.events
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map(e => `${formatTimestamp(e.t_start)} [${e.signal}] ${e.label} (${e.score.toFixed(2)})`)
    .join('\n');

  const used = eventTimeline.signals_computed.join(', ');
  const failed = eventTimeline.signals_failed.length
    ? ` | failed: ${eventTimeline.signals_failed.join(', ')}`
    : '';

  content.push({
    type: 'text',
    text: `## Multi-Signal Event Timeline (${used}${failed}):\n\nTop events by confidence:\n${top}`,
  });
}
```

**Token budget:** 50 events × ~15 tokens = ~750 tokens added per run. Acceptable.

### buildSystemPrompt() — TASK section addition

Add to the TASK section after the existing "You will receive:" list:

```
3. A multi-signal event timeline showing: audio reaction events (cheering, shouting, laughter,
   gasping via YAMNet), voice pitch spikes above the speaker's baseline, elevated speech rate
   windows, reaction language clusters, visual scene changes, and silence-then-spike patterns.

Use the event timeline as corroborating evidence. Moments where multiple signals converge
are almost always stronger clip candidates than energy alone. Moments with no corroborating
signals may still be good clips if the transcript supports it — use your judgment.
```

---

## New Stage: extract_signals (Stage 4.5)

### Code location

New file: `src/main/signals.js` — exports `runSignalExtraction()` and all JS signal functions.  
Called in `ai-pipeline.js` between Stage 4 and Stage 5.

### Function signature

```js
async function runSignalExtraction({
  wavPath,         // audio.wav path
  sourceFile,      // source video path (for scene change)
  energyJson,      // from Stage 4
  transcription,   // from Stage 3
  processingDir,
  videoName,
  pythonPath,
  archetype,       // from creatorProfile in store
  logger,
  isTest = false,
}) -> Promise<EventTimeline | null>
```

### Execution order

```
1. computeTranscriptDensity(transcription)     — JS, sync
2. computeReactionWords(transcription)         — JS, sync
3. detectSilenceSpike(energyJson)              — JS, sync
4. Promise.all([
     spawnYamnet(wavPath),                     — Python subprocess
     spawnPitchSpike(wavPath),                 — Python subprocess
     spawnSceneChange(sourceFile),             — Python/FFmpeg subprocess
   ])
5. Read output JSON files for all three
6. buildEventTimeline(all signals, archetype)
7. Write event_timeline.json to processing/signals/
8. Return eventTimeline
```

### Timeouts

- YAMNet: `timeout: 120000` (2 min)
- Pitch spike: `timeout: 300000` (5 min)
- Scene change: `timeout: 120000` (2 min)

### Progress reporting

```
sendProgress("signals", 50, "Extracting audio signals...");
sendProgress("signals", 52, "Running YAMNet + pitch analysis + scene detection...");
sendProgress("signals", 54, `Signals complete — ${n} events detected`);
```

### is_test logging

When `isTest === true`, logger emits per-signal wall-clock times, event counts, top-5 composite-score segments, and full path to `event_timeline.json`.

---

## Fallback Behavior

| Failure scenario | Behavior |
|-----------------|----------|
| `yamnet_events.py` exits non-zero | yamnet_boost = 0; redistribute weight; log warning |
| `pitch_spike.py` exits non-zero | pitch_boost = 0; redistribute weight; log warning |
| `scene_change.py` exits non-zero | scene_change_boost = 0; redistribute weight; log warning |
| All Python subprocesses fail | composite_score = energy-weighted only; identical to current behavior |
| JS signal function throws | catch; that signal = 0; log; continue |
| Entire `runSignalExtraction` throws | catch in main pipeline; `eventTimeline = null`; Stage 5 uses energy sort; no event timeline in prompt |

No signal extraction failure can propagate to the outer pipeline catch. Stage 4.5 is always best-effort.

---

## Runtime Budget

**Target:** total signal extraction adds < 2× current pipeline runtime for a 1-hour recording.

| Stage | Estimated time (CPU, 1hr recording) |
|-------|--------------------------------------|
| Transcription (existing) | ~5–10 min |
| Energy analysis (existing) | ~1–3 min |
| YAMNet (new) | ~10–15 sec |
| Pitch spike (new) | ~20–40 sec |
| Scene change (new) | ~20–40 sec |
| JS signals (new, combined) | < 100ms |
| **New signal overhead (concurrent)** | **~1 min** (all 3 Python run in parallel) |

Total pipeline with signals: ~7–14 min vs. ~6–13 min current. **Signal overhead < 15% of total pipeline time. Well within budget.**

---

## Bundling Implications (Pre-Launch Blocker #3)

### New pip dependencies (existing whisper venv)

| Package | Version | Reason | Est. installed size |
|---------|---------|--------|-------------------|
| `tflite-runtime` | 2.14.0 | YAMNet TFLite inference | ~8 MB |
| `librosa` | >=0.10 | Pitch spike (pYIN) + audio prep | ~25 MB |
| `soundfile` | >=0.12 | WAV I/O for librosa | ~5 MB |

No second venv needed. No TensorFlow. No PyTorch additions.

### New model files

| Signal | Model file | Est. size |
|--------|-----------|-----------|
| YAMNet | `yamnet.tflite` | ~3.2 MB |
| Pitch spike | none (algorithmic) | 0 MB |
| Scene change | none (FFmpeg) | 0 MB |

### Total new footprint

| Component | Size |
|-----------|------|
| Extra pip packages | ~38 MB |
| YAMNet tflite model | ~3.2 MB |
| Signal Python scripts | < 1 MB |
| **Total addition** | **~42 MB** |

This is a significant reduction from the earlier draft (~94 MB) due to dropping the jrgillick laughter model (~50 MB).

**Model download strategy:** `yamnet.tflite` is small enough (~3.2 MB) to bundle directly in the installer. No on-demand download needed.

---

## Launch vs. Defer: Speech Emotion Model (Signal 7, deferred)

**Signal:** audeering wav2vec2 dimensional emotion — arousal, dominance, valence. Model: ~1.2 GB.

### Recommendation: DEFER to v2.

1. **YAMNet + pitch spike already cover the arousal dimension.** The emotion model's primary value is arousal (high-energy emotional state). YAMNet detects Shout, Screaming, Whoop, Cheering, Gasping. Pitch spike catches the vocal expression arc. What remains uncovered is *low-arousal emotional nuance* — which rarely produces clip-worthy moments for gaming or just-chatting content.

2. **Valence requires calibration data we don't have.** Negative valence (frustration, anger) looks identical between "funny fail" (good clip) and "genuine tilt" (bad clip). Without per-creator valence data, including it is noise more than signal.

3. **1.2 GB is ~29× the rest of the signal stack.** The total new footprint for signals 1–6 is ~42 MB. Adding the emotion model multiplies that by 29×.

4. **Auto-updater isn't shipped yet.** If it ships at v1, delivering a replacement or updated model in v2 requires a manual re-download workflow that doesn't exist yet.

**For v2:** Revisit after 30+ sessions of feedback data from early users. If energy + signals 1–6 still misses moments the creator wanted, the feedback DB will tell you *which archetype* and *which signal gap* to close. At that point, the auto-updater will be in place and the data will justify the 1.2 GB cost.

---

## Chat Log Signal (deferred indefinitely until live recording support)

Chat message-rate spikes are the strongest external predictor of clip-worthy moments in research. ClipFlow explicitly does **not** implement this signal because:

1. **Requires non-default user setup** (OBS chat logging, VOD export)
2. **Doesn't serve small creators** — meaningful chat signal requires ~50+ concurrent viewers
3. **Every other signal in this spec works for any creator, any audience size**

**Future trigger:** If ClipFlow ever ships a live recording companion (OBS plugin, browser extension) that captures chat natively, chat spike should be the first signal added. At that point, it requires zero user action and works proportionally at any audience size.

---

## Implementation Sequence

1. **Create `src/main/signals.js`** — implement JS signals (transcript density, reaction words, silence spike) + `buildEventTimeline()` + `runSignalExtraction()` shell
2. **Wire into ai-pipeline.js** — add Stage 4.5 call, thread `eventTimeline` into Stage 5 (frame sort) and Stage 6 (prompt)
3. **Add archetype-aware weights** — add `ARCHETYPE_WEIGHTS` map and weight redistribution logic
4. **Prompt changes** — update `buildUserContent()` and `buildSystemPrompt()` in ai-prompt.js
5. **`tools/signals/yamnet_events.py`** — fastest model signal, lowest risk, validate subprocess pattern
6. **`tools/signals/pitch_spike.py`** — librosa.pyin, validate pitch baseline computation
7. **`tools/signals/scene_change.py`** — FFmpeg only, validate output parsing
8. **is_test validation pass** — run on test recording, check `extraction_ms` and event counts
9. **Fallback verification** — manually break each signal, confirm pipeline completes cleanly

---

## Open Questions

1. **YAMNet class names in tflite model** — validate exact class label strings against `yamnet_class_map.csv` from TFHub before hardcoding. Some names differ slightly from AudioSet documentation (e.g. "Chuckle, chortle" vs "Chuckle/chortle").

2. **Pitch baseline across content types** — pYIN works best on isolated voice. Gaming recordings have mic-only audio (ClipFlow's dedicated track requirement), so pitch baseline is clean. Confirm this holds for all recording setups before shipping.

3. **Scene change threshold tuning** — OBS uses fade transitions for stream start/end which may trigger false positives at threshold=0.4. May need to filter the first and last 30 seconds, or raise threshold to 0.5. Validate on a real recording.

4. **Reaction word patterns for non-English** — current regex is English-only. Not a launch blocker (product is English-first), but worth noting.

5. **Archetype weight validation** — the `ARCHETYPE_WEIGHTS` values are educated guesses. After 10+ sessions per archetype, run logistic regression over signal boosts vs. approved/rejected labels to calibrate. Track this as a v2 data task.

6. **`audio.wav` file lifecycle** — Stage 4.5 uses `wavPath`. The wav is deleted at Stage 8. Signal extraction runs before Stage 8 — confirmed safe. If Stage 3 is ever refactored to early-delete the wav, revisit.

7. **energy_scorer.py path** — currently hardcoded to `D:\whisper\energy_scorer.py` (issue [#68](https://github.com/Oghenefega/ClipFlow/issues/68)). Must be resolved before bundling. New signal scripts in `tools/signals/` use the correct `__dirname`-relative pattern from day one.
