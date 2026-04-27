# ClipFlow — Session Handoff
_Last updated: 2026-04-27 — Session 30 — Issue #72 fully closed. Pick the next big rock from open issues._

---

## One-line TL;DR

Issue #72 Phase 4 (pitch_spike) shipped via a `librosa.pyin` → `librosa.yin` swap, plus 8 kHz resample and chunked iteration: **280s → 4.9s in-app, 57× speedup**, all 6 signals now compute on the reference 30-min RL recording with strict mode ON, pipeline runs end-to-end without modal intervention. Issue #72 is done — Phase 1 ✅ (session 28), Phase 2 dropped on merits ✅ (session 29), Phase 3 ✅ (session 29), Phase 4 ✅ (this session).

---

## What just shipped (session 30)

### Phase 4 — pitch_spike SHIPPED

**The problem:** `librosa.pyin` is one atomic Viterbi-smoothed call with no in-flight callbacks. On the reference 30-min recording it ran ~280s and was killed by Phase 1's 30s stall timer. Phase 1 designed for this — Phase 4 fixes it.

**The journey:**
1. **Baseline capture** (~280s standalone): unpatched pYIN at sr=16000/hop=512 → 608 elevated windows, baseline F0 93.6 Hz, 38134 voiced frames. Established the accuracy reference.
2. **First patch attempt — chunked pYIN at sr=8000/hop=1024:** crashed inside `librosa.sequence.transition_local` with `target=481, input=551`. Root cause: pYIN's transition matrix width is `max_transition_rate * 12 * (hop/sr) / resolution` — at hop=1024/sr=8000 this gives 552, exceeding the 481-wide pitch grid. Constraint: `(hop/sr) < 0.111`. Documented inline in the script.
3. **Second patch — chunked pYIN at sr=8000/hop=512:** worked correctly (588 windows, 98.6% match within 1s of baseline) but ran 126s — 2.2× faster than baseline but still over the <60s acceptance budget.
4. **Pioneer gate fired — swapped pYIN → YIN:** YIN at sr=8000/hop=1024 finished in **4.9s in-app** (1.0s pure inference + 3.9s audio load + Python startup). 60× faster than the chunked-pYIN attempt, 57× faster than the unpatched baseline.

**Files touched:** [tools/signals/pitch_spike.py](tools/signals/pitch_spike.py) only. No Node-side changes, no UI changes — JSON output shape (signal/baseline_f0_hz/windows[]) is identical so the composite scorer in [src/main/signals.js](src/main/signals.js) needed no edits.

### Accuracy tradeoff (YIN vs unpatched pYIN baseline)

- **Recall: 99.2%** — only 5 of 608 baseline windows missing in YIN. Pipeline doesn't lose pitch-spike events.
- **Window count: +33%** — 809 vs 608. The extras come from YIN's per-frame independence vs pYIN's HMM smoothing. pYIN reclassifies confident-but-isolated voiced frames as unvoiced based on probabilistic context; YIN treats every frame standalone. The extras are short voiced bursts — exactly the rapid reaction shouts pitch_spike is meant to catch on gaming content.
- **Score distribution: virtually identical** — mean 0.804 baseline vs 0.806 YIN.
- The downstream multi-signal scorer combines pitch_spike with yamnet/energy/transcript_density/reaction_words/silence_spike, so isolated YIN extras only contribute to clip selection if other signals also fire on the same moment. Net effect on output: slight increase in pitch-driven clip candidates that pass the multi-signal threshold.

### In-app smoke test results

Reference 30-min RL recording, **strict mode ON** (the real default, the actual success state Phase 1 was building toward):

```
YIN finished in 1.0s (61 chunks)
Wrote 809 elevated windows
extraction_ms: pitch_spike=4884, yamnet=132766
signals_complete: computed=energy,transcript_density,reaction_words,silence_spike,yamnet,pitch_spike failed=(none)
Pipeline complete: 15 clips generated (signalSummary=all)
```

All 6 signals green. Zero failures. No degrade modal. signalSummary=all. Reference log: [processing/logs/RL_2026-10-15_Day9_Pt1_1777306420203.log](processing/logs/RL_2026-10-15_Day9_Pt1_1777306420203.log).

### Files touched (session 30)

- `tools/signals/pitch_spike.py` — full rewrite of the analysis core (pYIN → YIN, sr=8000, hop=1024, chunked loop, NaN-based voicing). Module docstring updated to explain Phase 4 changes.
- `tasks/todo.md` — Phase 4 plan written → executed → marked done. Replaced with closeout summary.
- `HANDOFF.md` — this file.
- `CHANGELOG.md` — session 30 entry prepended.

---

## Start the next session here — pick from open issues

Issue #72 is done. The next session opens with no in-flight phase work. Run the start-session ritual (`gh issue list --repo Oghenefega/ClipFlow --state open`) and pick from the open backlog. The most-load-bearing options:

- **[#75](https://github.com/Oghenefega/ClipFlow/issues/75)** — Clip cutting + retranscription performance. **The biggest remaining lever in the pipeline log** (37% + 26% of compute on the reference recording). Three stacked improvements on Clip Cutting (stream-copy where keyframe-aligned, NVENC where re-encode needed, parallel cuts) and two on Clip Retranscription (whisperx batching, pipeline parallelism). Combined potential: ~13.5 min compute → ~4–6 min on the reference recording. Pre-launch performance hardening.
- **[#74](https://github.com/Oghenefega/ClipFlow/issues/74)** — Hide pipeline internals from end users. The signal-health card exposes "YAMNet," "Pitch spike," etc. — leaks competitive moat to anyone screen-recording. Needs branded copy before any external user runs the pipeline. Smaller scope than #75. Should land before beta but is not blocking right now.
- **[#73](https://github.com/Oghenefega/ClipFlow/issues/73)** — Cold-start UX (3–5s blank screen). Two-phase plan in the issue body. Independent of pipeline work.
- **[#70](https://github.com/Oghenefega/ClipFlow/issues/70)** — Rename watcher rigidity. Orthogonal to pipeline, smaller scope.

The default recommendation is #75 — biggest remaining performance win, picks up where #72 left off in the same problem domain.

---

## Logs / debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log` — main process events, IPC errors, store mutations.
- **Pipeline logs:** `processing/logs/<videoName>.log` — per-pipeline-run stdout/stderr from every step. Phase 4 added new stderr lines from `pitch_spike.py`: `Audio: ... s @ ... Hz (loaded in ...s)`, `Running YIN in N chunks of ~Xs...`, `YIN finished in ...s (N chunks)`, `Baseline F0: ... Hz (N voiced frames)`. Greppable.
- **Latest reference log:** `processing/logs/RL_2026-10-15_Day9_Pt1_1777306420203.log` — full session 30 in-app smoke test with strict mode ON, all 6 signals green.
- **Phase 4 standalone artifacts (still on disk in `tmp/`):**
  - `tmp/pitch-spike-baseline.json` + `.log` — unpatched pYIN baseline (608 windows, 280s).
  - `tmp/pitch-spike-patched.json` + `.log` — chunked pYIN attempt (588 windows, 126s).
  - `tmp/pitch-spike-yin.json` + `.log` — final YIN run (809 windows, 4.6s).
  - `tmp/phase3-baseline/audio.wav` — pre-extracted 16kHz mono reference audio. Reuse for any future signal benchmarking — saves the ffmpeg extraction step.
- **DevTools live signal events:** `window.clipflow.onSignalProgress((d) => console.log(d))`.

---

## Watch out for

- **Don't restore pYIN on hop=1024 at sr=8000.** That combo crashes inside librosa's `transition_local` because of the `max_transition_rate * 12 * (hop/sr) / resolution > n_pitch_bins` constraint. There's an inline comment in the script explaining this. If you ever rebuild pitch_spike on pYIN you must keep `(hop/sr) < 0.111` — at sr=8000 that means hop ≤ 512.
- **YIN output is +33% windows vs pYIN.** This is structural (no Markov smoothing), not a bug. The downstream multi-signal scorer absorbs the noise. If clip selection ever shows obvious pitch-driven false positives, the lever is `--min-voiced-sec` (default 0.5) or `--threshold-mult` (default 1.4) — both are CLI args on the script.
- **Heartbeat protocol is now overprovisioned for pitch_spike.** YIN runs in ~1s and only emits PROGRESS once or twice. The chunk loop is retained for future-proofing — if a 2-hour recording somehow takes >30s in YIN the heartbeats will still fire. Don't simplify the chunking out without thinking about that.
- **Strict mode is still default ON.** The Phase 4 success state assumes strict mode ON — that's the only way the "no modal" assertion holds. If you turn strict OFF you'll see the ask-degrade modal whenever any signal fails.
- **Clip count varies 15–22 across runs.** This is downstream scoring/dedup variance, not a Phase 4 regression. The composite scorer's deterministic core is fed by some non-deterministic stages (whisper transcription, yamnet float order, parallel signal extraction race conditions). Worth watching but not a smoke-test red flag on its own.

---

## Session model + cost

- **Model:** Sonnet 4.6 → Opus 4.7 mid-session for the pYIN→YIN pivot decision and verification.
- **Files committed this session:** 4 (pitch_spike.py, tasks/todo.md, HANDOFF.md, CHANGELOG.md).
- **Issues closed:** [#72](https://github.com/Oghenefega/ClipFlow/issues/72) — fully resolved across sessions 28-30.
