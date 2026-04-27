# ClipFlow — Session Handoff
_Last updated: 2026-04-27 — Session 29 — Phase 2 dropped + Phase 3 (yamnet) shipped. Next: Phase 4 (pitch_spike)._

---

## One-line TL;DR

Issue #72 collapsed from 4 phases to 3 — Phase 2 (scene_change) was dropped on the merits after data showed the speedup target unreachable AND the signal contributes minimally to clip selection. Phase 3 (yamnet) shipped: ~339ms → ~71ms per inference call via `num_threads=8`, plus a conservative RMS pre-filter (threshold 0.002, default ON, settings toggle) that skips genuinely silent frames. End-to-end yamnet on the reference 30-min RL recording: **626s → 130s, all 4 reaction events preserved bit-identically.** In-app smoke test passed in both toggle states. Phase 4 (pitch_spike) is the only remaining piece of Issue #72.

---

## What just shipped (session 29)

### Phase 2 — scene_change DROPPED

Evidence-driven decision after three failed attempts to hit `<15s`:
1. `-hwaccel auto` chose dxva2 but actual HEVC decode stayed software-side (`hevc (native)` in stderr); `+ scale=640:360` was *slightly slower* than baseline (168s vs 151s).
2. `+ -an` (skip audio decode) shaved 14% to 147s — audio wasn't the bottleneck.
3. `+ -skip_frame nokey` was fast-but-broken (5s with 1 cut at the wrong timestamp).
4. Plan-B i-frame heuristic via ffprobe was dead — keyframe size doesn't correlate with scene cuts in NVENC HEVC. Two real cuts had keyframes in the median size band (rank 192 and 218 of 433).
5. Hardware decode capped near 12× realtime; `<15s` would need ~120× realtime which means not decoding pixels at all.

Strategic call: signal contributed binary boost on ~6 segments out of hundreds, lagged audio reaction signals that already detected the same moments. Deleted entirely. See [tasks/todo.md](tasks/todo.md) (the previous Phase 2 plan and resolution block were captured there in session 29 mid-work; Phase 4 plan replaces it next session).

### Phase 3 — yamnet SHIPPED

Two stacked wins on [tools/signals/yamnet_events.py](tools/signals/yamnet_events.py):

1. **`Interpreter(model_path=..., num_threads=min(os.cpu_count() or 4, 8))`** — ai-edge-litert defaults to single-threaded; this enables TFLite's CPU thread pool. Per-call inference: ~339ms → ~71ms. **Dominant lever — 4.8× speedup from this alone.**
2. **RMS pre-filter at threshold 0.002** — calibrated below typical microphone room-tone (~0.001–0.003). Frames quieter than this mathematically cannot contain reaction-class sounds. At this threshold, the filter skips ~1.5% of frames on typical content — small speedup, big quality guarantee. Tunable via the new `yamnetSilenceSkip` settings toggle.

Combined: yamnet on reference 30-min RL: **626s → 130s** with 4/4 reaction events preserved bit-identically (same timestamps, classes, scores).

### Settings toggle (`yamnetSilenceSkip`)

- Default ON. Migration in [src/main/main.js](src/main/main.js) writes `true` for existing installs without clobbering explicit user choices.
- UI toggle lives in the existing "Pipeline Quality" card alongside strict mode in [src/renderer/views/SettingsView.js](src/renderer/views/SettingsView.js). Label: "Skip silent audio in YAMNet."
- When OFF, threads `--no-rms-skip` to the Python script which sets the effective threshold to 0.0 and runs inference on every frame.

### In-app smoke test results

Reference 30-min RL recording, strict mode OFF (so pitch_spike's stall doesn't abort the pipeline):

- **Skip ON:** yamnet 134.9s ✓, pitch_spike stall ❌ (expected), 15 clips generated
- **Skip OFF:** yamnet 135.7s ✓, pitch_spike stall ❌ (expected), modal appeared correctly
- ~1s difference between toggle states — confirms the toggle is a quality guarantee, not a meaningful performance lever at threshold 0.002

### Files touched (session 29)

- `tools/signals/scene_change.py` — DELETED
- `src/main/signals.js` — scene_change references removed across 13 sites; archetype weights renormalized; `spawnYamnet` accepts `silenceSkip` option; `runSignalExtraction` accepts `yamnetSilenceSkip`
- `src/main/main.js` — defaults + migration for `yamnetSilenceSkip`
- `src/main/ai-pipeline.js` — reads `yamnetSilenceSkip` from store, passes to `runSignalExtraction`
- `tools/signals/yamnet_events.py` — `num_threads`, RMS pre-filter, `--no-rms-skip` flag, audio/model-load timings
- `src/renderer/views/UploadView.js` — scene_change row removed (5-row table now)
- `src/renderer/views/SettingsView.js` — yamnetSilenceSkip toggle in Pipeline Quality card
- `tasks/todo.md` — Phase 3 plan written, executed, replaced with this state
- `HANDOFF.md` — this file
- `CHANGELOG.md` — session 29 entry prepended

---

## Start the next session here — Issue #72 Phase 4 (pitch_spike)

**Read [#72](https://github.com/Oghenefega/ClipFlow/issues/72) before touching anything.** Direction is locked: Path A only (no degraded fallback), cheapest-first, concrete pioneer gate.

### Phase 4 plan in plain language (high-level — write a detailed plan to [tasks/todo.md](tasks/todo.md) at session start per global rule 1)

pitch_spike's failure mode in Phase 1's smoke test is **stall**, not backstop. The pYIN call (`librosa.pyin(...)`) is one atomic operation with no callback or progress hook — it can't emit `PROGRESS` heartbeats mid-call. The script today emits `PROGRESS 0.0` at start, then runs pYIN for 100+ seconds while the stall timer counts down. At 30s post-grace the timer fires and kills the process. Phase 1's design accepted this — it's the failure mode the heartbeat protocol surfaces.

Three plausible cheap fixes per the issue body:

1. **Chunk the audio into N segments and run pYIN per-chunk.** After each chunk emits a `PROGRESS` heartbeat, then continue to the next. Chunk size is a tradeoff: too small (e.g., 10s) = more overhead per chunk; too large (e.g., 60s) = stall timer still fires within a single chunk. ~30s chunks should keep heartbeats firing within the 30s stall window with margin.
2. **Replace pYIN with a faster pitch tracker.** [`librosa.yin`](https://librosa.org/doc/main/generated/librosa.yin.html) is the older single-pitch YIN algorithm; pYIN is the probabilistic refinement. YIN is faster but slightly less accurate. May or may not satisfy the precision needed for pitch-spike detection.
3. **GPU-accelerated pitch via [torchcrepe](https://github.com/maxrmorrison/torchcrepe)** — a deep-learning pitch tracker that runs on the RTX 3090. Larger refactor (new dep, model load), but could be much faster end-to-end if the per-chunk loop in option 1 is still too slow.

### Files this would touch

- [tools/signals/pitch_spike.py](tools/signals/pitch_spike.py) — chunk loop, per-chunk pYIN call, heartbeat emission. Existing `progress(p)` helper at the top of the file is reusable.

That's it. No Node-side changes, no UI changes, no settings — Phase 1 already wired the plumbing.

### Pioneer gate

If chunked pYIN doesn't get pitch_spike under 60s on the reference recording AND the stall timer doesn't false-fire, fall back to YIN (option 2) then torchcrepe (option 3).

### Acceptance for Phase 4

- pitch_spike completes under ~60s on reference 30-min RL recording.
- `PROGRESS` heartbeats fire steadily throughout — stall timer never fires.
- Detected pitch-spike events within ~10% of an unbatched baseline (need to capture this baseline first since Phase 1 always killed pitch_spike before it could complete).
- Signal-health UI shows pitch_spike advancing live and finishing green ✓.
- No regression in the four other working signals.
- In-app smoke test with **strict mode ON** (the real default) — pipeline runs end-to-end without modal intervention. This is the success state Phase 1 was building toward.

### Plan-first protocol (non-negotiable)

Per global CLAUDE.md rule 1: write the Phase 4 plan to [tasks/todo.md](tasks/todo.md) (currently has the Phase 3 plan that was just executed — replace it) and **stop for approval before any code.**

### Baseline capture

The pre-Phase-4 pitch_spike has never run to completion on this recording (Phase 1 always killed it). So Step 1 of Phase 4 will be: temporarily widen the stall timer (one-off non-committed edit to `STALL_TIMEOUT_MS` in `runPythonSignal`, or run pitch_spike standalone via CLI bypassing the timer entirely — same trick used for Phases 2 and 3). Get the unfiltered event count and timestamps. Revert the timer. THEN apply the chunking patch and validate against that baseline. The pre-extracted reference audio at `tmp/phase3-baseline/audio.wav` is still on disk and can be reused — saves the ffmpeg extraction step.

---

## Other open work

- **Issue [#74](https://github.com/Oghenefega/ClipFlow/issues/74)** — pre-launch UX hardening: hide pipeline internals from end users (replace "YAMNet," "Pitch spike," etc. with branded copy). Filed this session. Don't do before Phase 4 closes; should land before any external user runs the pipeline.
- **Issue [#75](https://github.com/Oghenefega/ClipFlow/issues/75)** — Clip cutting + retranscription performance (37% + 26% of pipeline compute). Filed this session after analyzing the in-app smoke-test log. **The next big-impact work after Phase 4.** Three stacked levers on Clip Cutting (stream-copy where keyframe-aligned, NVENC where re-encode needed, parallel cuts) and two on Clip Retranscription (whisperx batching, pipeline parallelism). Combined: ~13.5 min compute → ~4–6 min compute on the reference recording. Pre-launch performance hardening.
- **Issue [#70](https://github.com/Oghenefega/ClipFlow/issues/70)** — Rename watcher rigidity. Orthogonal, smaller scope, can slot between #72 phases.
- **Issue [#73](https://github.com/Oghenefega/ClipFlow/issues/73)** — Cold-start UX (3–5s blank screen). Two-phase plan in the issue body.

---

## Logs / debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log` — main process events, IPC errors, store mutations.
- **Pipeline logs:** `processing/logs/<videoName>.log` — per-pipeline-run stdout/stderr from every step. Phase 3 added new lines to `yamnet_events.py` stderr: `Audio length: ... (loaded in ...s)`, `Model loaded in ...s`, `Skipped N/M silent frames (RMS < T); inference loop ...s`. Greppable.
- **Latest reference log:** `processing/logs/RL_2026-10-15_Day9_Pt1_1777296803915.log` — full session 29 in-app smoke test. Useful as Phase 4's "what does a working pipeline look like" reference.
- **Phase 1 IPC on the wire:** open DevTools (Ctrl+Shift+I) and run `window.clipflow.onSignalProgress((d) => console.log(d))` to see live signal events. 5 signals now (no scene_change).
- **Phase 4 baseline note:** if you need to capture the unfiltered pitch_spike baseline before patching, run standalone via the betterwhisperx Python and the existing `tmp/phase3-baseline/audio.wav` (already extracted). Same approach as Phases 2 and 3.

---

## Watch out for

- **Don't put scene_change back without a fundamentally different approach.** The drop was on the merits: ffmpeg scene-detect is decode-bound and i-frame size doesn't signal scene cuts in NVENC content. A future visual signal (e.g., CLIP embeddings sampled at 0.5fps) would be a new architecture, not reviving the deleted script.
- **Threshold 0.002 in yamnet is calibrated against gaming audio.** If a future user has a recording with unusual noise floor (e.g., compressed audio with hum at exactly 0.002 RMS), the filter could behave oddly. The toggle exists exactly for this — let users turn it off if it ever misbehaves.
- **Don't widen the stall window in Phase 4 to "make pitch_spike pass" without chunking.** The whole point of Phase 1 was that the user gets a clear truth. If chunking is the wrong fix, fall back to a different pitch tracker — don't soften the timer.
- **Phase 1 stall-timer + backstop are unchanged.** Don't touch them. The fix lives in the Python scripts.
- **The signal-health UI now has 5 rows.** Don't restyle the table for 6. Array-driven render handles it automatically but watch any hardcoded layout assumptions.
- **`runSignalExtraction` now reads `yamnetSilenceSkip` from electron-store via the AI pipeline.** If Phase 4 needs a similar setting for pitch_spike chunking, mirror the pattern — don't invent a new pathway.
- **Strict mode is still default ON.** In-app testing of Phase 4 should ideally run with strict ON to verify the pipeline completes without the modal — that's the actual success state.

---

## Session model + cost

- **Model:** Opus 4.7 throughout (full session — Phase 2 evidence-gathering, Phase 3 implementation, smoke testing).
- **Context window at wrap:** ~29% (294.4k / 1M).
- **Files committed this session:** 9 (see "Files touched" above).
- **Issues filed:** [#74](https://github.com/Oghenefega/ClipFlow/issues/74), [#75](https://github.com/Oghenefega/ClipFlow/issues/75).
- **Issue updated:** [#72](https://github.com/Oghenefega/ClipFlow/issues/72) with a Phase 2-drop comment and (this session-end) a Phase 3-ship comment.
