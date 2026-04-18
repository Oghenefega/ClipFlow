# ClipFlow — Session Handoff
_Last updated: 2026-04-18 (session 20) — "Lever 1 multi-signal pipeline spec"_

---

## Current State

Spec-only session. No code was changed. The codebase is in the same state as the end of Session 19.

One GitHub issue filed: **[#68](https://github.com/Oghenefega/ClipFlow/issues/68)** — `energy_scorer.py` hardcoded to `D:\whisper\energy_scorer.py` in `ai-pipeline.js:161`, must be moved to `tools/` before bundling.

---

## What Was Built

A full architecture spec for **Lever 1 — Multi-Signal Pipeline Upgrade**:

- **Canonical location:** `The Lab/Businesses/ClipFlow/specs/lever-1-signal-extraction-v1.md` (Obsidian vault)
- **Repo copy:** `specs/lever-1-signal-extraction-v1.md`

The spec defines a new `extract_signals` stage (Stage 4.5 in `ai-pipeline.js`) that runs after energy analysis and before frame extraction. It adds 6 new signals to replace the current energy-only heuristic.

---

## Key Decisions

**Signals approved for launch:**

| Signal | Type | Runtime | New deps |
|--------|------|---------|----------|
| YAMNet audio events (17 classes) | Python subprocess | ~10s | `tflite-runtime` (~8 MB) |
| Voice pitch spike (librosa.pyin) | Python subprocess | ~30s | `librosa` (~25 MB) |
| FFmpeg scene change | Python subprocess | ~30s | none |
| Transcript density | JS in-process | <10ms | none |
| Reaction word detection | JS in-process | <5ms | none |
| Silence-then-spike | JS in-process | <50ms | none |

**Total new footprint: ~42 MB. Pipeline overhead: < 15% on a 1-hour recording.**

**Deferred / dropped:**
- jrgillick/laughter-detection — dropped (unmaintained since ~2021, install-fragile, YAMNet covers laughter natively)
- audeering wav2vec2 emotion model — deferred to v2 (1.2 GB, ~29× the rest of the stack, no usage data, auto-updater not shipped)
- Chat log spike — deferred until live recording companion exists (non-default user setup, meaningless for small creators)

**Archetype-aware composite weights** baked in from day one — values are estimates, calibrate after 10+ sessions of feedback data per archetype.

---

## Next Steps

**Immediate:** Open a new session with **Opus 4.7** to review the spec end-to-end. If everything checks out, approve for implementation.

**Implementation sequence (from spec):**
1. Create `src/main/signals.js` — JS signal functions + `runSignalExtraction()` shell
2. Wire Stage 4.5 into `ai-pipeline.js` — thread `eventTimeline` into Stage 5 (frame sort) and Stage 6 (prompt)
3. Prompt changes in `ai-prompt.js` — event timeline block in `buildUserContent()` + task section in `buildSystemPrompt()`
4. `tools/signals/yamnet_events.py`
5. `tools/signals/pitch_spike.py`
6. `tools/signals/scene_change.py`
7. is_test validation pass + fallback verification

**Fix #68 first** — move `energy_scorer.py` to `tools/energy_scorer.py` before bundling any new signals. That's the first commit of the implementation session.

---

## Watch Out For

- **YAMNet class names** — validate exact label strings against `yamnet_class_map.csv` from TFHub; some differ from AudioSet docs
- **Scene change threshold** — OBS fade transitions may trigger false positives at 0.4; may need to filter first/last 30s or raise to 0.5
- **Composite weights are untuned** — `ARCHETYPE_WEIGHTS` in the spec are educated guesses, not validated values
- **#68 blocks bundling** — fix hardcoded `D:\whisper\` path before any tools bundling work
- **Opus 4.7 review session** — spec was written on Sonnet 4.6; use Opus for the review pass to catch anything missed
