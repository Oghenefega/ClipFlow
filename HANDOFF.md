# ClipFlow — Session Handoff
_Last updated: 2026-04-25 — Session 28 — Issue #72 Phase 1 shipped (UX + heartbeat infra). Next: Phase 2 (scene_change optimization)._

---

## One-line TL;DR

**Issue #72 Phase 1 is done.** Strict-mode toggle + `PROGRESS` heartbeat protocol + signal-health UI + ask-degrade modal all shipped. Smoke test on reference 30-min RL recording produced a clear strict abort + a working non-strict modal — no silent degradation. **Phase 2 (scene_change → <15s)** is next, and it's the cheapest fix in the four-phase plan.

---

## What just shipped (session 28)

Phase 1 closes the silent-degradation hole that was the original #72 bug. Three failure modes are now diagnosed from real heartbeat data on the reference recording:

| Signal | Failure mode | Phase 1 detection | Phase 2-4 fix |
| --- | --- | --- | --- |
| `scene_change` | **stall** (~30s post-grace) | showinfo lines stop arriving — software decode too slow | **Phase 2:** `-hwaccel auto` + `scale=640:360` |
| `yamnet` | **backstop** (361s) | alive the whole time but ~65ms × 1850 frames = 120s+ | **Phase 3:** batch inference + skip silent frames |
| `pitch_spike` | **stall** (~30s post-grace) | atomic pYIN call can't emit progress mid-flight | **Phase 4:** chunk + parallelize so heartbeats fire between chunks |

All four files I changed are committed; live screenshot showed the signal-health table with three explicit ❌ rows + the ask-degrade modal listing each failure reason. **The bug is fixed in the user-experience sense:** failures are loud, never silent.

---

## Start the next session here — Issue #72 Phase 2

**Read [#72](https://github.com/Oghenefega/ClipFlow/issues/72) "Phase 2 — scene_change optimization" before touching anything.** Founder direction is locked: Path A only (no retreat to lower-quality fallback), cheapest-first, concrete pioneer gate.

### Phase 2 plan in plain language

scene_change today does single-threaded software decode of a 1080×1920 @ 60fps 30-min recording with a scene-detect filter on every decoded frame. That's ~108k frames at software-decode speeds. Two stacked one-line changes should crush this:

1. **Add `-hwaccel auto`** to the ffmpeg command. Enables DXVA2/D3D11VA hardware decode on Windows. 5–10x decode speedup, effectively free.
2. **Pre-scale via `scale=640:360`** before the scene-detect filter. Scene cuts are obvious at low res; decoding 640×360 vs 1080×1920 is a 9x pixel reduction. ~3–5x on top of hwaccel.

Stacked, this should drop scene_change from 120s+ to well under 15s on the reference recording.

### File touched

- [tools/signals/scene_change.py:71-77](tools/signals/scene_change.py#L71) — the `cmd = [...]` block. Add `-hwaccel auto` before `-i`. Add the scale filter to the `-vf` chain: `scale=640:360,select='gt(scene,0.4)',showinfo`.

That's it. No new IPC, no new UI. Phase 1's signal-health table will show scene_change going green in <15s and the user will see the live progress bar advancing fast.

### Pioneer gate — concrete

If hwaccel + scale doesn't hit <15s in one focused session: prototype an i-frame heuristic via `ffprobe -show_frames` (gaming recordings often i-frame-align at hard scene cuts). If that misses too many soft cuts, write a custom thumbnail-diff detector. The issue body has the ranked options.

### Acceptance for Phase 2

- scene_change completes in <15s on the reference 30-min RL recording.
- Detected scene-cut count within 10% of the current implementation (sanity check against the pre-fix output).
- Signal-health UI shows scene_change advancing live and finishing green.
- No regression in any other signal's behavior.

---

## Plan-first protocol

Per global CLAUDE.md rule 1: write the Phase 2 plan to [tasks/todo.md](tasks/todo.md) (currently holds the Phase 1 plan with all decisions resolved — replace it) and **stop for approval before any code.** Phase 2 is a one-file change but the pioneer-gate logic + the validation step (comparing scene-cut counts) deserve explicit acceptance criteria.

---

## Reference materials

- **Reference recording:** `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\Test Footage\2026-10\RL 2026-10-15 Day9 Pt1.mp4`
- **Phase 1 smoke-test log:** the latest `processing/logs/RL_2026-10-15_Day9_Pt1_<timestamp>.log` from this session — should contain the `signals_complete: ...` summary line with `pitch_spike (stall, ...)`, `yamnet (backstop, ...)`, `scene_change (stall, ...)`.
- **Issue #72 body:** the carrier doc, Phases 1–4 with locked directions and pioneer gates.
- **Phase 1 plan + resolved decisions:** [tasks/todo.md](tasks/todo.md).
- **Spec:** `specs/lever-1-signal-extraction-v1.md` (background context).

---

## Logs / debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log` — main process events, IPC errors, store mutations.
- **Pipeline logs:** `processing/logs/<videoName>.log` — per-pipeline-run stdout/stderr from every Python script + the new Phase 1 structured failure lines (`<signal> stalled — no PROGRESS for 30s (total elapsed Ns); killing`, `<signal> backstop fired at Ns; killing`, `signals_complete: computed=... failed=...`).
- **Phase 1 protocol on the wire:** open DevTools (Ctrl+Shift+I) and run `window.clipflow.onSignalProgress((d) => console.log(d))` to see the IPC events as they fire.

---

## Watch out for

- **Phase 1 stall-timer assumes well-behaved heartbeats.** scene_change today gets killed by the stall timer because showinfo lines stop arriving fast enough on a slow decode. Once Phase 2 lands, the heartbeat will fire correctly and the timer won't false-fire. **Don't soften the 30s stall window to "make Phase 1 pass" before Phase 2 — that defeats the whole design.**
- **`-hwaccel auto` falls back to software decode if no hardware decoder is available.** On Fega's machine that won't matter (Windows + GPU), but it's worth noting in code review: if a user has no GPU, scene_change will just be slow, not broken. Phase 2 should still ship — it's a strict improvement.
- **The `scale` filter chain order matters.** `scale=640:360,select='gt(scene,0.4)',showinfo` — scale must come first so scene detect runs on the downscaled frames. Putting scale after select would still scale all selected frames but defeat the speedup since selection happens at full resolution.
- **Some recordings might trigger different scene-cut counts at low res.** That's the validation step — compare against the current count and flag if delta > 10%. Likely fine for gaming content (cuts are visually pronounced), but worth checking.
- **The `cmd = [...]` block is what gets logged via `logger?.logCommand?.()` — no need to add new logging, the existing pipeline log will show the new ffmpeg invocation verbatim.**
- **Don't touch heartbeat code in Phase 2.** Phase 1's `progress(p)` calls in scene_change.py (lines 65, 99, 115, 124) work as-is — the speedup just makes them fire faster.

---

## Open issues (commercial-launch blockers)

- **[#72](https://github.com/Oghenefega/ClipFlow/issues/72) — Lever 1 signal timeouts.** Phase 1 done. **Phase 2 (scene_change) is next session's work.** Phases 3 (yamnet) and 4 (pitch_spike) follow.
- **[#70](https://github.com/Oghenefega/ClipFlow/issues/70)** — Rename watcher rigidity. Orthogonal, smaller scope, can slot between #72 phases.
- **[#73](https://github.com/Oghenefega/ClipFlow/issues/73)** — Cold-start UX (3–5s blank screen). Two-phase: branded splash window, then bundle code-splitting.

---

## Session model + cost

- **Model used:** Opus 4.7 throughout (full Phase 1 implementation).
- **Files touched:**
  - `src/main/main.js` (defaults + migration + signalProgress emit + degradeAnswer IPC)
  - `src/main/ai-pipeline.js` (signature widened + Stage 4.5 strict/degrade gate + completion-toast variants)
  - `src/main/signals.js` (`runPythonSignal` rewrite, return-shape change, orchestrator-crash → "extractor" failure)
  - `src/main/preload.js` (3 new bridge methods)
  - `tools/signals/yamnet_events.py` (heartbeat helper + 2 emission points)
  - `tools/signals/pitch_spike.py` (heartbeat helper + 4 emission points)
  - `tools/signals/scene_change.py` (full Popen rewrite + stderr streaming)
  - `src/renderer/views/UploadView.js` (PIPELINE_STEPS, signal-health table, completion-toast variants, signalProgress subscription)
  - `src/renderer/views/SettingsView.js` (Pipeline Quality card with strict-mode toggle)
  - `src/renderer/App.js` (ask-degrade modal + IPC subscription)
- **Net result:** seven main-process files clean (`node -c` OK), three Python scripts clean (`py_compile` OK), renderer Vite build clean.
