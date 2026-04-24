# ClipFlow — Session Handoff
_Last updated: 2026-04-23 — Session 21: Lever 1 spec review + lock (Opus 4.7). No code written this session._

---

## One-line TL;DR

Opus 4.7 reviewed the Lever 1 multi-signal pipeline spec written in session 20, walked the founder through every decision in plain English, locked 8 concrete decisions, updated the spec in the Obsidian vault, and parked implementation to next session due to context budget. **Implementation is greenlit and ready to start — do NOT re-review the spec; it is final.**

---

## Current State

- **Branch:** `master`. HEAD after this session: the commit that contains this HANDOFF + CHANGELOG update.
- **No source code changed.** No `src/` or `tools/` files touched. This was a review-and-decide session only.
- **Spec is final.** `C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\specs\lever-1-signal-extraction-v1.md` has been updated with a "Locked Decisions" block at the top and inline edits throughout. Read it FIRST next session.
- **One GitHub issue filed:** [#69](https://github.com/Oghenefega/ClipFlow/issues/69) — user-facing trim toggle. Not a Lever 1 blocker; tracked separately.

---

## What Was Decided This Session

The spec had been drafted in session 20 by Sonnet 4.6 after a research pass. Opus 4.7 reviewed it and flagged five technical areas. After back-and-forth with the founder (who wanted everything explained in plain English), the following 8 decisions were locked:

### 1. Archetype weights — narrowed spread
Hype energy dropped from 0.55 → **0.50**. Chill raised from 0.25 → **0.30**. 20-point spread instead of 30. Reason: reduce risk of off-archetype moments getting structurally excluded (quiet-but-funny on a hype creator; loud moment on a chill creator).

Locked map (every row sums to 1.0):
```js
const ARCHETYPE_WEIGHTS = {
  hype:        { energy: 0.50, yamnet: 0.15, pitch: 0.10, density: 0.05, reaction_words: 0.10, scene_change: 0.05, spike: 0.05 },
  competitive: { energy: 0.40, yamnet: 0.15, pitch: 0.15, density: 0.10, reaction_words: 0.10, scene_change: 0.05, spike: 0.05 },
  chill:       { energy: 0.30, yamnet: 0.10, pitch: 0.20, density: 0.15, reaction_words: 0.15, scene_change: 0.05, spike: 0.05 },
  variety:     { energy: 0.40, yamnet: 0.15, pitch: 0.15, density: 0.10, reaction_words: 0.10, scene_change: 0.05, spike: 0.05 },
};
// just_chatting → use chill weights
```

### 2. Pitch spike loads audio at native 16 kHz, not 22050 Hz
`audio.wav` (Stage 2 output) is already 16 kHz mono. pYIN works fine at this rate; resampling is unnecessary overhead. Use `librosa.load(path, sr=None)`. Keep `frame_length=2048, hop_length=512` — at 16 kHz that's ~128 ms / ~32 ms per frame, still in the useful pYIN range.

### 3. Pitch spike score formula — explicit
```python
score = min(1.0, mean_f0 / baseline - 1.0)
```
Maps 1.4× baseline (the detection threshold) → 0.4. Maps 2.0× baseline → 1.0. Linear between. Capped at 1.0 for anything above 2× baseline. The spec's original examples didn't follow any consistent formula; new examples in the spec match this one.

### 4. Scene change — Option A locked
Use `ffmpeg -i <video> -vf select='gt(scene,0.4)',showinfo -f null -` and parse `pts_time` from stderr. Emit `score: 1.0` for every detected event — `showinfo` doesn't expose the scene-change score itself, but the composite formula uses `scene_change_boost ∈ {0, 1}` anyway, so this is fine. Comment this clearly in the Python script. If real scores are ever needed, swap to the `scdet` filter in v2.

### 5. No auto-trim of first/last N seconds
The pipeline never silently excludes source video ranges. User-controlled trim is tracked in [#69](https://github.com/Oghenefega/ClipFlow/issues/69). Open question #3 in the original spec (about filtering stream start/end fades) is retired.

### 6. Fallback redistribution formula — explicit
```js
// For each surviving signal i:
new_weight[i] = old_weight[i] / (1 - sum_of_failed_weights);
```
Surviving signals scale up proportionally; total stays at 1.0.

### 7. YAMNet class list stays at 17
Not expanded for just-chatting content up front. Revisit based on real-recording data once the pipeline runs. Risk of expanding now is noise (e.g. creator coughing repeatedly during a session would flag every cough).

### 8. Frames to Claude stays at 20
Composite scoring + narrowed archetype weights surface diverse moments; no need to send more frames.

---

## Exact Implementation Sequence for Next Session

Follow this in order. Do NOT skip around. Each step is verifiable before moving to the next.

### Step 1 — Create `src/main/signals.js`
Single new file. Exports:
- `ARCHETYPE_WEIGHTS` — the map above
- `computeTranscriptDensity(transcription, windowSec = 5)` — JS, in-process. Sliding-window words-per-second with elevated-ratio detection. See spec "Signal 4".
- `computeReactionWords(transcription, windowSec = 5)` — JS, in-process. Regex over transcript for hype/shock/fail/clutch patterns. See spec "Signal 5".
- `detectSilenceSpike(energyJson, silenceThresholdSec = 1.0, spikeMultiplier = 2.0)` — JS, in-process. Scans `energyJson` for silence runs followed by spike. See spec "Signal 6".
- `buildEventTimeline({ energyJson, yamnet, pitch, sceneChange, density, reactionWords, silenceSpike, archetype, videoName, sourceDuration })` — merges all signals into the unified event timeline JSON (see spec "Unified Event Timeline JSON Schema"). Applies fallback redistribution when a signal is null/failed. Computes per-segment composite scores.
- `runSignalExtraction({ wavPath, sourceFile, energyJson, transcription, processingDir, videoName, pythonPath, archetype, logger, isTest })` — top-level orchestrator. Runs JS signals first (sync), then Promise.all dispatches 3 Python subprocesses, reads their JSON outputs, calls `buildEventTimeline`, writes `processing/signals/<videoName>.event_timeline.json`, returns the timeline object. Never throws — on total failure returns `null` and pipeline falls back to energy-only.

For step 1, leave the three Python-spawn functions as stubs returning `null` (graceful failure path). That way the JS layer is testable end-to-end before any Python is written.

### Step 2 — Wire Stage 4.5 into `ai-pipeline.js`
- Add `const signals = require("./signals")` at top.
- After Stage 4 (Energy Analysis ends around line 507 of current file), before Stage 5, call:
  ```js
  sendProgress("signals", 50, "Extracting audio signals...");
  logger.startStep("Signal Extraction");
  const creatorProfile = store.get("creatorProfile") || undefined;
  const archetype = creatorProfile?.archetype || "variety";
  const eventTimeline = await signals.runSignalExtraction({
    wavPath, sourceFile, energyJson, transcription,
    processingDir, videoName, pythonPath, archetype,
    logger, isTest: !!gameData.isTest,
  });
  logger.endStep("Signal Extraction", eventTimeline ? `${eventTimeline.events.length} events` : "fallback (energy only)");
  ```
- Modify `extractTopFrames` to accept `eventTimeline` and sort by `composite_score` when timeline is non-null, fall back to `peak_energy` when null. Keep the rest of the function unchanged.
- Pass `eventTimeline` to `buildUserContent`.
- Add `"signals"` to the subdirs list in `ensureProcessingDirs` at the top of the file.

### Step 3 — Update `ai-prompt.js`
- `buildUserContent({ claudeReadyText, frames, eventTimeline })` — new third param. When `eventTimeline?.events?.length > 0`, insert a new text content block between transcript and frames showing the top 50 events sorted by score (see spec "Prompt Changes").
- `buildSystemPrompt` — add the event-timeline explanation to the TASK section (see spec).

### Step 4 — Build + smoke-test
`npx react-scripts build && npm start`. Run a short test recording through. Verify the pipeline completes even though all 3 Python signals return null (graceful degradation path exercises). Check `processing/signals/` dir is created.

### Step 5 — Python: `tools/signals/yamnet_events.py`
First Python signal. Fastest and lowest-risk. **Before writing, validate YAMNet's 17 class labels against the actual `yamnet_class_map.csv` from TFHub** — the spec flags that names like "Alarm" and "Chuckle, chortle" may differ slightly from AudioSet docs.

### Step 6 — `tools/signals/pitch_spike.py`
Second. Uses `librosa.pyin`. **Load at native 16 kHz** (decision #2 above). **Use the explicit score formula** (decision #3 above).

### Step 7 — `tools/signals/scene_change.py`
Third. Uses `ffmpeg` only. **Emit `score: 1.0` for every detected event** (decision #4 above). No auto-trim.

### Step 8 — is_test validation pass
Run on a real test recording. Verify `extraction_ms` numbers are in-budget, event counts are reasonable, top-5 composite-score segments look right.

### Step 9 — Fallback verification
Manually break each signal (rename the script, break the Python deps, etc.) and confirm the pipeline completes cleanly with the remaining signals.

---

## Files to Read First Next Session

In this order:

1. **`C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\specs\lever-1-signal-extraction-v1.md`** — the spec, now with locked decisions block at top. Source of truth.
2. **This HANDOFF.md** — the summary of what was decided + the exact sequence.
3. **`src/main/ai-pipeline.js`** — where Stage 4.5 gets wired in (insertion point documented in Step 2).
4. **`src/main/ai-prompt.js`** — `buildUserContent` and `buildSystemPrompt` are what changes.
5. **`tools/transcribe.py`** (optional) — reference pattern for how Python subprocesses are spawned, stdin/stderr handled, utf8 mode, etc. Matches the pattern the 3 new Python scripts should follow.

---

## Key Decisions From This Session

- **Session 20's spec was accepted with 8 modifications** (listed above). The 5 review areas flagged by Opus 4.7: fallback redistribution (sound, made explicit), YAMNet class list (sound, kept at 17), pitch spike algorithm (one fix — 16 kHz not 22050, plus explicit score formula), Promise.all on Windows (no issues), scene change threshold + command (one fix — use simple command with score=1.0 placeholder).
- **Archetype weights were narrowed at founder's request** in response to the concern that rigid weights would cause a hype creator's chill moments to be structurally excluded. The math rationale: even with narrowed spread, the top-20 selection is within-recording, and Claude is the final filter — so quiet gems have multiple safety nets.
- **Founder rejected auto-trimming first/last 30s of video** for scene change. Replaced with user-controlled trim toggle tracked in #69. Important principle: the pipeline never silently excludes user content.
- **Founder flagged not reading the tech summary earlier** — Opus went back and read `context/technical-summary.md` in the Obsidian vault. No conflicts surfaced. Confirmed Stage 2 extracts 16 kHz mono WAV (validates decision #2 above).

---

## Watch Out For

- **The spec mentions `energy_scorer.py` at `D:\whisper\`** — issue [#68](https://github.com/Oghenefega/ClipFlow/issues/68). The new signal scripts in `tools/signals/` MUST use the `__dirname`-relative pattern from day one: `path.join(__dirname, '..', '..', 'tools', 'signals', '<script>.py')`. Do NOT copy the hardcoded-path pattern from `runEnergyScorer`.
- **pYIN at 16 kHz** — the spec's original 22050 Hz was wrong. Stage 2 extracts 16 kHz mono per the tech summary. Use `librosa.load(path, sr=None)` to preserve native rate.
- **`showinfo` filter does not output scene scores** — only pts_time per frame. Emit `score: 1.0`, comment it clearly. Confirmed in the spec.
- **audio.wav deletion at Stage 8** — signal extraction runs before Stage 8, so it has access to the wav. Confirmed in spec open question #6. If Stage 3 is ever refactored to early-delete the wav, revisit.
- **Graceful degradation is non-negotiable** — no signal extraction failure can propagate to the outer pipeline catch. Every Python spawn, every file read, every JSON parse must be wrapped. On total failure, `eventTimeline = null` and Stage 5 falls back to `peak_energy` sort (identical to current behavior). Lever 1 must never make the pipeline worse than it was.
- **Do not auto-trim any user content** anywhere in the pipeline. If scene change events fire during OBS stream fades, that's fine — they'll just not coincide with speech segments so the boost contributes nothing. User trimming is tracked in #69.

---

## Runtime Budget Reminder

For a 1-hour recording:
- YAMNet: ~10–15 s
- Pitch spike: ~20–40 s
- Scene change: ~20–40 s
- JS signals (density, reaction words, silence-spike combined): < 100 ms
- **Total new overhead (3 Python run concurrently via Promise.all):** ~1 min
- Target: < 2× current pipeline runtime. Easily achieved.

---

## Logs / Debugging

- **Electron log file:** `%APPDATA%\clipflow\logs\app.log`
- **Pipeline logs:** `processing/logs/<videoName>.log` — `PipelineLogger` in `src/main/pipeline-logger.js`. Signal extraction should use `logger.startStep("Signal Extraction")` / `logger.endStep(...)` like every other stage.
- **Signal JSON outputs go to:** `processing/signals/<videoName>.event_timeline.json` (plus per-signal intermediate JSONs for debugging — `<videoName>.yamnet.json`, `.pitch_spike.json`, `.scene_change.json`).
- **is_test mode** — when `gameData.isTest === true`, logger emits per-signal wall-clock times, event counts, top-5 composite-score segments, and full path to the timeline JSON. See spec "is_test logging".

---

## Open GitHub Issues Relevant to Lever 1

- **[#68](https://github.com/Oghenefega/ClipFlow/issues/68)** — `energy_scorer.py` hardcoded to `D:\whisper\`. New scripts in `tools/signals/` must NOT repeat this mistake.
- **[#69](https://github.com/Oghenefega/ClipFlow/issues/69)** — User-facing trim toggle (filed this session). Not a Lever 1 blocker; parallel work.
- **[#62](https://github.com/Oghenefega/ClipFlow/issues/62)** — Pipeline fails on clips with silent/near-silent audio (energy_scorer.py exit 1). Lever 1 doesn't fix this directly but graceful degradation means a future session adding retry/fallback here won't conflict.

---

## Session Model + Cost

- **Model used:** Opus 4.7 (switched mid-session from Sonnet 4.6 before the review). Stayed Opus for the whole decision pass.
- **Session ended at ~57% context** — ran out of budget before coding. Implementation deferred deliberately.
- **Next session should start on Sonnet** (per global rule #7: "Default Sonnet. Opus only for complex architecture where Sonnet struggles.") — all architecture is already decided; coding is straightforward execution from here.
