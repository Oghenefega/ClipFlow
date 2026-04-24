# ClipFlow — Session Handoff
_Last updated: 2026-04-24 — Session 22: Lever 1 implementation (Opus 4.7). All 7 signals live; Steps 8–9 (validation) remain._

---

## One-line TL;DR

Stage 4.5 (multi-signal pipeline) is fully implemented end-to-end. All 7 signals fire on synthetic data, composite scoring is math-correct, graceful degradation works, build is clean. What's left is real-recording validation (is_test log review + manually breaking each signal).

---

## Current State

- **Branch:** `master`. HEAD is the session-22 commit containing all Lever 1 implementation + CHANGELOG + HANDOFF updates.
- **7 new/modified files.** All JS builds clean with Vite. All 3 Python scripts smoke-tested standalone + through the JS spawn chain.
- **Python venv updated.** `D:\whisper\betterwhisperx-venv` now has `ai-edge-litert==2.1.4`, `librosa==0.11.0`, `soundfile==0.13.1`.
- **No real-recording test yet.** Synthetic smoke tests all passed. Next session needs a short real recording run through the pipeline with `isTest: true`.

---

## What Shipped This Session

| File | Status | Purpose |
|------|--------|---------|
| `src/main/signals.js` | **new** | Stage 4.5 orchestrator + JS signals + composite scoring |
| `src/main/ai-pipeline.js` | modified | Stage 4.5 call, `extractTopFrames` sort change, `signals/` subdir |
| `src/main/ai-prompt.js` | modified | `eventTimeline` param in `buildUserContent`, TASK bullet 3 |
| `tools/signals/yamnet_events.py` | **new** | YAMNet classifier (17-class subset) |
| `tools/signals/pitch_spike.py` | **new** | pYIN F0 baseline + elevated-window detection |
| `tools/signals/scene_change.py` | **new** | ffmpeg `showinfo` scene-cut detector |
| `tools/signals/yamnet.tflite` | **new** | 4.1 MB MediaPipe YAMNet model (bundled) |
| `tools/signals/yamnet_class_map.csv` | **new** | 521-class name→index map |
| `CLAUDE.md` | modified | Build & Run section updated for Vite |
| `CHANGELOG.md` | modified | Session 22 entry |

---

## Key Deviation From Spec

**`tflite-runtime` → `ai-edge-litert`.** The spec called for `tflite-runtime==2.14.0`. That package has no Windows / Python 3.12 wheel as of 2026 — pip literally says "Could not find a version that satisfies the requirement". `ai-edge-litert` is Google's official successor: same `Interpreter` API, 12.8 MB wheel, no TensorFlow dependency. Python scripts fail loud if it's not installed — they do NOT fall back to full `tensorflow` (would be 500+ MB of bloat, explicitly rejected by founder).

---

## Runtime Behavior Verified

On a synthetic 30 s WAV + 10 s MP4:
- **7/7 signals fired** — energy, transcript_density, reaction_words, silence_spike, yamnet, pitch_spike, scene_change
- **Weights sum to 1.0 exactly** (hype archetype, no failures → base weights intact)
- **Composite math correct** — 0.725 top-segment score matches `0.5×0.95 + 0.1×1 + 0.1×1 + 0.05×1` by hand
- **Pitch-spike baseline** — detected 121 Hz on a 120 Hz source tone
- **YAMNet** — labeled sine-wave segments as "Music", silence as "Silence"
- **Scene-change** — caught red→blue ffmpeg-concat boundary at exactly t=5.0 s
- **11 s wall-clock total.** Promise.all parallelizes the 3 Python subprocesses.

Fallback path also tested: with all 3 Python stubs returning null, weights redistribute correctly (energy 0.5 → 0.714, reaction_words 0.1 → 0.143, etc.) and sum stays at exactly 1.0.

---

## Next Session — Exactly What To Do

### Step 8 — is_test validation (needs a real recording)

Pick a short gaming recording (~5–10 min). Run it through the pipeline with `isTest: true` (typically via the Test flag in the AI pipeline UI, or however Fega's test flow works). Then:

1. **Read `processing/logs/<videoName>.log`.** Look for the "Signal extraction (is_test)" block — shows wall-clock times, signals_computed, signals_failed, top-5 composite segments.
2. **Open `processing/signals/<videoName>.event_timeline.json`.** Sanity-check it:
   - All 7 signals listed in `signals_computed`, nothing in `signals_failed`
   - `weights_applied` matches the base archetype weights (no redistribution kicked in)
   - `events` array is populated across all 6 per-signal labels (yamnet reaction classes, pitch_spike, scene_cut, transcript_density, reaction_words, silence_spike)
   - Top-5 segments by `composite_score` look intuitively like real moments (hype/reaction peaks)
3. **Compare top-20 composite segments vs. top-20 peak_energy segments.** Are they different? If they're nearly identical, the multi-signal machinery isn't actually changing frame selection — worth investigating why (weights too energy-dominant? signals producing too few events? overlap window too narrow?).
4. **Runtime sanity** — extraction_ms for yamnet / pitch_spike / scene_change should match the spec's budget (~10 s / ~20–40 s / ~20–40 s for a 1-hour recording; proportionally less for shorter).

### Step 9 — fallback verification

Manually break each signal and confirm the pipeline still completes cleanly:

1. **Break YAMNet** — temporarily rename `tools/signals/yamnet.tflite` → `yamnet.tflite.bak`. Rerun pipeline. Expected: `signals_failed` contains `yamnet`, weights redistributed to survivors, pipeline still produces clips.
2. **Break pitch_spike** — temporarily rename `tools/signals/pitch_spike.py`. Expected: same graceful degradation.
3. **Break scene_change** — rename `tools/signals/scene_change.py`. Expected: same.
4. **Break all three at once** — pipeline should still run identical to pre-Lever-1 behavior (peak_energy-sorted frames, no event-timeline prompt block, Claude Analysis unchanged).

After each break, restore and move on.

---

## Files to Read First Next Session

1. **This HANDOFF.md** — current state + the Step 8 / 9 checklist above.
2. **`src/main/signals.js`** — the core of Lever 1. Understand `buildEventTimeline` before reviewing event_timeline.json output.
3. **`C:\Users\IAmAbsolute\Documents\Obsidian Vault\The Lab\Businesses\ClipFlow\specs\lever-1-signal-extraction-v1.md`** — the locked spec. Reference for expected behavior during validation.

No need to re-read `ai-pipeline.js` / `ai-prompt.js` unless validation surfaces a behavior question — the wiring is thin.

---

## Watch Out For

- **`ai-edge-litert` on a fresh install.** If the installer ships without the venv, Fega (or future me) needs to `pip install ai-edge-litert librosa>=0.11 soundfile>=0.12` into whatever Python the app uses. Bundling implications tracked in spec section "Bundling Implications".
- **YAMNet model at `tools/signals/yamnet.tflite`** must ship with the installer (it's 4.1 MB, git-committed). If `yamnet_events.py` can't find it, it exits 2 and the signal is logged as failed — not a crash, but you won't get yamnet_boost.
- **Numpy 2.x compatibility.** Venv has numpy 2.4.3, which is fine with librosa 0.11 and ai-edge-litert 2.1.4. Do not downgrade numpy.
- **Electron bundling.** `tools/signals/` must be added to `electron-builder`'s `files` array when bundling (same pattern as `tools/transcribe.py`). Verify this when auto-updater work happens (#50).
- **Spec compliance gaps to watch during validation.** A few places where my implementation made a judgment call the spec didn't specify:
  - YAMNet `MIN_SCORE = 0.05` filter on emitted frames — keeps the JSON small. Spec didn't specify; if validation shows too many or too few events, adjust.
  - Reaction-word score normalization `hits/wordCount * 10` capped at 1.0. Spec said "tuned empirically" — this is my best guess for v1.
  - Pitch spike `voiced_sec >= 0.5` gate uses hop-based counting (voiced_count × hop_sec). Good enough; worth eyeballing on real voice.

---

## Runtime Budget — Actuals vs. Spec

Spec targets for a 1-hour recording:
- YAMNet: ~10–15 s → we saw ~1 s for 30 s audio → scales to ~60 s for 1hr (still well under budget but bigger than spec suggested)
- Pitch spike: ~20–40 s → we saw ~9 s for 30 s audio → ~18 min for 1hr if linear — **this is a red flag**, worth measuring on real data
- Scene change: ~20–40 s → ffmpeg is proportional to video length

If pitch_spike scales linearly on real data it'll blow the budget. Two likely causes: (1) pYIN is O(n) but has real constants, and synthetic sine wave may be pathological; (2) real voice with gaps processes faster than continuous tones because of voicing_flag filtering. Measure on Step 8 — if it's truly too slow, switch to `pyin` with a larger hop or switch to a cheaper F0 estimator (crepe-lite, yin).

---

## Logs / Debugging

- **Electron log file:** `%APPDATA%\clipflow\logs\app.log`
- **Pipeline logs:** `processing/logs/<videoName>.log` (PipelineLogger). Signal extraction writes a "Signal Extraction" step block here.
- **Signal JSONs:** `processing/signals/<videoName>.{yamnet,pitch_spike,scene_change,event_timeline}.json` — all human-readable.
- **is_test mode** — enable via `gameData.isTest = true`. Emits the per-signal wall-clock table + top-5 composite segments to the pipeline log.

---

## Open GitHub Issues Relevant to Lever 1

- **[#68](https://github.com/Oghenefega/ClipFlow/issues/68)** — `energy_scorer.py` still hardcoded to `D:\whisper\`. Lever 1 scripts did NOT repeat this mistake (they live in `tools/signals/` with `__dirname`-relative resolution). Fixing #68 is still required before shipping.
- **[#69](https://github.com/Oghenefega/ClipFlow/issues/69)** — User-facing trim toggle. Not blocking Lever 1.
- **[#62](https://github.com/Oghenefega/ClipFlow/issues/62)** — Pipeline fails on silent clips (energy_scorer.py exit 1). Lever 1 doesn't fix this, but graceful degradation means a future session adding retry here won't conflict.

---

## Session Model + Cost

- **Model used:** Opus 4.7 throughout. Founder explicitly authorized Opus for the session ("as long as it's better").
- **No context problems** — implementation finished well inside budget.
- **Next session is simpler than this one** — just validation + fallback breakage. Sonnet is plenty for that work.
