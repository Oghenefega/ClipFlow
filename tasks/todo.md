# ClipFlow — Task Tracker

> Plan first. Track progress. Verify before marking done.

---

# Session Plan — Issue #72 Phase 1

**Goal:** Stop silent degradation when Lever 1 signals time out. Ship the UX + heartbeat infrastructure so a failed signal either aborts the pipeline loudly (strict mode = ON, default) or asks the user explicitly via modal (strict mode = OFF). Phase 1 is a hard gate before Phases 2–4 — it's the measurement infrastructure those phases need to validate themselves.

**Issue:** https://github.com/Oghenefega/ClipFlow/issues/72
**Direction is locked.** Path A (engineer past the library — no retreat). Strict mode default ON. Cheapest-first optimization order. Concrete pioneer gate.

---

## What Phase 1 actually changes (plain language)

1. **Python signal scripts learn to say "I'm alive."** Each of the 3 Python scripts (`yamnet_events.py`, `pitch_spike.py`, `scene_change.py`) prints `PROGRESS <float>` to stderr periodically — `<float>` is `0.0` to `1.0`. No JSON, no fancy schema. v1 is `PROGRESS 0.42` and that's it.
2. **Node stops black-box-ing the Python processes.** The current `runPythonSignal` waits a full wall-clock timeout (120s / 300s) regardless of whether the script is making progress or hung. After Phase 1, Node streams stderr line-by-line, parses `PROGRESS` lines as a heartbeat, and **kills the process if no PROGRESS arrives within 30s** (after a per-signal startup grace period).
3. **The user sees a per-signal health table on the pipeline progress card.** Five rows: energy, transcript_density, yamnet, pitch_spike, scene_change. Each shows running / done / failed plus a percentage and elapsed time.
4. **Strict mode is a real toggle.** Settings gets a "Strict mode — abort pipeline on any signal failure" toggle, persisted to electron-store, **default ON**. Schema migration so existing installs get `strictMode: true`.
5. **The pipeline behaves differently on signal failure depending on the toggle.** Strict ON + any signal fails → pipeline aborts, loud red toast names which signal died and after how long. Strict OFF + any signal fails → modal at the Stage 4.5 boundary asks "N of 5 signals failed. Generate clips anyway with degraded quality? [Yes] [No]" and the completion toast loudly reports degradation regardless of choice.
6. **Acceptance is binary.** Drop the broken 30-min RL recording in. Either pipeline aborts within ~30s of pitch_spike going silent (strict) or modal appears with explicit degradation choice (non-strict). **Never** silent "22 clips generated ✓" with 3 signals having contributed nothing.

**Key risk Phase 1 deliberately accepts:** pitch_spike's pYIN call is one big atomic operation with no internal progress emission. With only the coarse `PROGRESS 0.0` (start) / `0.5` (after audio load) / `1.0` (just before write) heartbeat possible without rewriting the algorithm, the 30s stall-timer **will kill pitch_spike** on the reference recording. That's the intended Phase 1 behavior — the user gets a clear strict-mode abort or a clear non-strict modal. Phase 4 is what fixes pitch_spike performance.

---

## Build order — bottom up, foundation first

This order matters. If we build top-down (UI first), the UI fakes data. Bottom-up means each layer has real input from the layer below before it ships.

### Step 1 — `strictMode` electron-store migration (FIRST per `.claude/rules/pipeline.md`)

The pipeline rule is non-negotiable: schema change → migration written before anything else.

- File: [src/main/main.js:204-272](src/main/main.js#L204) — `runStoreMigrations(store)` function.
- Add: `if (!store.has("strictMode")) store.set("strictMode", true);` near the other boolean defaults around line 217 (`devMode`).
- File: [src/main/main.js:200](src/main/main.js#L200) — the `defaults` object near the top. Add `strictMode: true` so fresh installs also pick it up via electron-store's `defaults` mechanism. Both the default AND the migration — defaults handle fresh installs, migrations handle upgrade from existing installs.
- **Verification:** delete `%APPDATA%\clipflow\config.json` (one user's electron-store file path), launch, confirm `strictMode: true` is written. Then manually flip it to `false`, restart, confirm it stays `false` (migration doesn't clobber an explicit user choice).

### Step 2 — Python heartbeat protocol (3 scripts)

Each script gets ~5–10 lines added.

- **`tools/signals/yamnet_events.py`** — easiest. The frame loop at [yamnet_events.py:103-116](tools/signals/yamnet_events.py#L103) iterates `n_frames`. Add at top of loop body: `now = time.time()`. Emit `print(f"PROGRESS {i / n_frames:.3f}", file=sys.stderr, flush=True)` if 5+ seconds since `last_progress_t`. Also emit `PROGRESS 0.0` right after model loads ([:93](tools/signals/yamnet_events.py#L93)) and `PROGRESS 1.0` just before the JSON write ([:125](tools/signals/yamnet_events.py#L125)).
- **`tools/signals/pitch_spike.py`** — coarse-only. pYIN is a single atomic call with no callbacks. Emit `PROGRESS 0.0` right after audio load ([pitch_spike.py:39](tools/signals/pitch_spike.py#L39)). No way to emit during pYIN itself in Phase 1 — that's a Phase 4 problem when chunking lands. Emit `PROGRESS 0.5` immediately after pYIN returns ([:50](tools/signals/pitch_spike.py#L50)). Then emit `PROGRESS <fraction>` inside the windowing loop ([:70-85](tools/signals/pitch_spike.py#L70)) as `0.5 + 0.5 * (t / max_t)` if 5+ seconds since last. Emit `PROGRESS 1.0` before write.
- **`tools/signals/scene_change.py`** — convert from `subprocess.run` to `subprocess.Popen`, stream stderr line-by-line. ffmpeg natively writes `frame=N` and `time=HH:MM:SS.mmm` lines on stderr. Estimate total frames upfront via the existing video duration (passed in, or via a quick `ffprobe -show_format` call). Per ffmpeg stderr line containing `frame=`, parse the frame number and emit `PROGRESS <frame / total_frames>` if 5+ seconds since last. Pass the existing `Parsed_showinfo` lines through unchanged so the regex parser at [:55-59](tools/signals/scene_change.py#L55) still works. Emit `PROGRESS 0.0` right after the cmd is constructed ([:42](tools/signals/scene_change.py#L42)) and `PROGRESS 1.0` after the loop completes.
- **Common helper at top of each script:**
  ```python
  import time
  _last_progress_t = 0.0
  def progress(p):
      global _last_progress_t
      now = time.time()
      if p in (0.0, 1.0) or now - _last_progress_t > 5.0:
          print(f"PROGRESS {p:.3f}", file=sys.stderr, flush=True)
          _last_progress_t = now
  ```
  Reuse via copy-paste — no shared module to import (these scripts are spawned from packaged builds, and a shared helper would need bundling).

### Step 3 — Rewrite `runPythonSignal` for real-time streaming + stall detection

This is the biggest single change. File: [src/main/signals.js:174-227](src/main/signals.js#L174).

- Replace `child.stderr.on("data", ...)` buffer-accumulation with `readline.createInterface({ input: child.stderr, crlfDelay: Infinity })`. Continue accumulating stderr text into a buffer too — the closing `logger?.logOutput?.("STDERR", ...)` call needs the full text, and we don't want to break log files.
- On each line: regex-match `^PROGRESS\s+([0-9.]+)\s*$`. If match → reset stall timer + invoke a new `onProgress(p)` callback.
- Add a `startupGraceMs` parameter (per signal: yamnet 15000, pitch_spike 5000, scene_change 5000).
- Stall timer: `setTimeout` at 30000ms after the startup grace. Reset on every PROGRESS line. On fire → `child.kill("SIGKILL")` + log + resolve null with a failure reason.
- Drop the existing `timeout` spawn option in favor of an "overall backstop" `setTimeout` we manage ourselves: `Math.max(60000, sourceDuration * 200)` (sourceDuration in seconds → backstop in ms = 0.2x source duration in seconds × 1000). Fires only as a last resort.
- Function signature gains: `startupGraceMs`, `sourceDuration`, `onProgress(p)`, returns `{ result, failureReason }` instead of just the parsed result. Failure reasons: `"stall"`, `"backstop"`, `"exit-code"`, `"missing-output"`, `"parse-error"`, `"missing-script"`, `"spawn-error"`. The current `null`-on-failure is rewritten to `{ result: null, failureReason: "..." }`.
- Backwards compat: `spawnYamnet`, `spawnPitchSpike`, `spawnSceneChange` wrappers ([:229-257](src/main/signals.js#L229)) get the new params threaded through. Their current shape (returns the parsed JSON or null) shifts to returning `{ result, failureReason, elapsed_ms }`.
- File: [src/main/signals.js:495-512](src/main/signals.js#L495) — the `runWithTiming` helper + `Promise.all` block in `runSignalExtraction`. Both need updating to handle the new return shape and forward `onProgress` callbacks.

### Step 4 — Wire IPC events from main → renderer

The existing `pipeline:progress` channel carries `{ stage, pct, detail }`. We add a parallel `pipeline:signalProgress` channel for per-signal heartbeat data.

- File: [src/main/main.js:1755-1760](src/main/main.js#L1755) — the `sendProgress` callback in the `generateClips` IPC handler. Add a sibling `sendSignalProgress(signal, payload)` that emits `pipeline:signalProgress` with `{ signal, status, progress, elapsed_ms, failureReason }`. `status` ∈ `{ "pending", "running", "done", "failed" }`.
- File: [src/main/ai-pipeline.js:418](src/main/ai-pipeline.js#L418) — `runAIPipeline` signature gains `sendSignalProgress`. Pass it through to `runSignalExtraction`.
- File: [src/main/signals.js:453-457](src/main/signals.js#L453) — `runSignalExtraction` gains `sendSignalProgress`. Each Python signal's `onProgress` callback emits the event. The 3 JS signals (transcript_density, reaction_words, silence_spike) emit a single `done` event (they're synchronous and fast).
- File: [src/main/preload.js:91-98](src/main/preload.js#L91) — alongside `onPipelineProgress`, expose:
  ```js
  onSignalProgress: (callback) => {
    ipcRenderer.on("pipeline:signalProgress", (_, data) => callback(data));
  },
  removeSignalProgressListener: () => {
    ipcRenderer.removeAllListeners("pipeline:signalProgress");
  },
  ```

### Step 5 — Signal-health UI on pipeline progress card

File: [src/renderer/views/UploadView.js:43-54](src/renderer/views/UploadView.js#L43) and [:894-958](src/renderer/views/UploadView.js#L894).

- New `useState({})` keyed by signal name → `{ status, progress, elapsed_ms, failureReason }`. Subscribe via `window.clipflow.onSignalProgress`.
- Add the existing `PIPELINE_STEPS` array's missing `signals` entry so the parent stage shows up properly. Currently the stage `"signals"` (set at ai-pipeline.js:522) has no PIPELINE_STEPS row, so the existing UI silently skips through it. Add: `{ key: "signals", label: "Signal Extraction", icon: "🎯" }` between `energy` and `frames`.
- Inside the `signals`-stage row when `isRunning` is true, render a sub-table with 5 rows (one per signal). Each row: status icon (✓ done / ⏳ running / ❌ failed / ⬜ pending), signal name, mini progress bar showing `progress * 100%`, elapsed time `<elapsed_ms / 1000>s`. Use existing T tokens — no new component library. Indicator dots get glow per `.claude/rules/ui-standards.md`.
- After the signals stage completes, the sub-table stays visible (collapsed/compacted) so the user can review which signals contributed.

### Step 6 — Strict mode toggle in Settings

The Settings view already has toggles for things like `devMode`, `analyticsEnabled`. Match the pattern.

- Find the SettingsView render path (search for `analyticsEnabled` in `src/renderer/views/SettingsView.js` — that's the analog).
- Add a "Pipeline Quality" or "Signal Strict Mode" section toggle:
  - Label: "Strict mode"
  - Description: "Abort pipeline on any signal failure. With strict mode off, the pipeline asks before continuing with degraded quality."
  - Bound to `store.get("strictMode")` via the existing `storeGet`/`storeSet` IPC bridge.
- Wire it: `window.clipflow.storeGet("strictMode")` to read, `window.clipflow.storeSet("strictMode", value)` to write. (These already exist — `getStoreValue` IPC handler at main.js:2166 plus the corresponding setter.)

### Step 7 — Completion toast variants + non-strict degrade modal

Three completion-toast variants are emitted via the existing `pipeline:progress` channel with `stage: "complete"` / `stage: "failed"` plus a new `signalSummary` field on the payload:
  - `{ stage: "complete", signalSummary: "all" }` → green toast "5/5 signals contributed. Pipeline complete."
  - `{ stage: "failed", signalSummary: "strict-fail", failedSignal: "pitch_spike", failedAfterMs: 32100 }` → red toast "Pipeline halted — pitch_spike failed after 32s. See log."
  - `{ stage: "complete", signalSummary: "degraded", failedSignals: ["pitch_spike", "yamnet"], clipCount: 22 }` → orange toast "22 clips generated — 2 of 5 signals failed. Clips may be lower quality. See log."

The non-strict modal is request/response over a new IPC pair:
- File: [src/main/ai-pipeline.js](src/main/ai-pipeline.js) at the Stage 4.5 boundary (just after `runSignalExtraction` returns, before frame extraction at ~line 537). If `signals_failed.length > 0` and `store.get("strictMode") === false`, send `pipeline:askDegrade` with `{ failed: [...], requestId }` to the renderer and `await` a promise that resolves when the renderer calls back via `ipcRenderer.invoke("pipeline:degradeAnswer", requestId, "yes" | "no")`.
- New IPC handler `pipeline:degradeAnswer` registered in main.js next to the other pipeline IPC.
- File: [src/main/preload.js](src/main/preload.js) — expose `onPipelineAskDegrade(callback)` and `pipelineDegradeAnswer(requestId, answer) => ipcRenderer.invoke("pipeline:degradeAnswer", requestId, answer)`.
- File: [src/renderer/views/UploadView.js](src/renderer/views/UploadView.js) (or a new top-level mount in App.js if cross-tab access is needed) — modal component listening on `onPipelineAskDegrade`, calls `pipelineDegradeAnswer` on user choice.
- If strict mode is ON and any signal failed → `runAIPipeline` throws an abort, caught at the top, emits `stage: "failed"` with the strict-fail summary. No modal.

### Step 8 — Build, smoke-test, accept

- `npm run build:renderer` → no errors.
- `npm start` → app launches.
- **Test 1 (strict default).** Drop reference recording `W:\YouTube Gaming Recordings Onward\Vertical Recordings Onwards\Test Footage\2026-10\RL 2026-10-15 Day9 Pt1.mp4`. Hit generate. Within ~5–35s of pitch_spike starting, stall-timer fires (because pYIN can't emit progress). Pipeline aborts with red toast naming pitch_spike + elapsed time. Signal-health table shows pitch_spike as ❌ with stall reason; yamnet and scene_change still have a chance to finish or also stall.
- **Test 2 (strict off).** Settings → toggle strict mode off. Re-run same recording. Same signal-stalls happen but at Stage 4.5 the modal appears: "N of 5 signals failed. Generate clips anyway with degraded quality?" Click Yes → pipeline continues, completion toast loudly reports degradation. Click No → pipeline aborts cleanly.
- **Test 3 (happy path).** Find or make a short clip (≤ 1 min) where all 5 signals comfortably finish in budget. Run. Confirm "5/5 signals contributed" green toast. Signal-health table shows all ✓.
- **Test 4 (existing install upgrade).** Don't delete config.json. Launch a fresh build on top of the existing user data. Confirm `strictMode: true` was written by migration without clobbering anything else.

---

## Acceptance criteria (Phase 1 only — Phases 2–4 have their own)

- [ ] `strictMode` key exists in electron-store with default `true`. Migration runs idempotently.
- [ ] `runPythonSignal` rewritten: streams stderr, parses `PROGRESS`, kills on stall (30s post-grace), kills on overall backstop (`max(60s, sourceDuration × 0.2)`).
- [ ] All 3 Python scripts emit `PROGRESS <float>` heartbeat.
- [ ] `pipeline:signalProgress` IPC events fire from main with `{ signal, status, progress, elapsed_ms, failureReason }`.
- [ ] Pipeline progress card shows live 5-row signal-health table during the signals stage.
- [ ] Settings has a Strict mode toggle bound to `strictMode` electron-store key.
- [ ] Strict mode ON + any signal fails → pipeline aborts with `stage: "failed"`, red toast names the signal + elapsed time.
- [ ] Strict mode OFF + any signal fails → modal at Stage 4.5 asks user, completion toast reports degradation regardless of choice.
- [ ] Reference 30-min RL recording produces either a clean strict abort (≤ ~35s after pitch_spike starts) or a clear non-strict modal — never silent "N clips generated."
- [ ] Existing `pipeline:progress` flow + `PIPELINE_STEPS` UI still works for non-signal stages.

---

## Files touched (estimated)

- `src/main/main.js` — defaults + migration + signalProgress emit + degradeAnswer IPC handler
- `src/main/ai-pipeline.js` — thread `sendSignalProgress` through, Stage 4.5 strict/degrade gate
- `src/main/signals.js` — `runPythonSignal` rewrite, return shape change, all 3 wrappers updated
- `src/main/preload.js` — `onSignalProgress`, `onPipelineAskDegrade`, `pipelineDegradeAnswer`
- `tools/signals/yamnet_events.py` — heartbeat helper + emissions
- `tools/signals/pitch_spike.py` — heartbeat helper + emissions (coarse only)
- `tools/signals/scene_change.py` — convert to Popen + stderr streaming + heartbeat
- `src/renderer/views/UploadView.js` — signal-health table, signalProgress subscription, completion toast variants, ask-degrade modal listener
- `src/renderer/views/SettingsView.js` — strict mode toggle

**Not touching:** the JS signals (transcript_density, reaction_words, silence_spike) — they're synchronous and fast, no heartbeat needed; just emit `done` once.

---

## Risks / watch out for

- **Heartbeat protocol must be the first runtime thing built.** Without it, the stall-timer has nothing to consume and the UI fakes data. Order: Python emits → Node parses → IPC fires → UI renders. Don't reverse this.
- **`runPythonSignal` is called from `Promise.all` at signals.js:508.** All 3 stall-timers run in parallel. The function-scoped `setTimeout` IDs must be cleaned on `child.on("close")` to avoid leaking + firing on already-exited processes.
- **Stall-timer must arm AFTER startup grace, not at spawn.** Otherwise yamnet's 15s model load fires the kill before the loop ever starts.
- **`PROGRESS` regex must be strict.** Some Python logs may coincidentally contain the word "progress." Match `^PROGRESS\s+[0-9]+\.?[0-9]*\s*$` only on full lines via readline.
- **stderr buffer for log files.** The current code logs full stderr on `child.on("close")`. Don't break that — accumulate in parallel with line-streaming.
- **electron-store `defaults` vs migration overlap.** `defaults` only applies on first install when the key has never existed. Migration applies on every launch. Both are needed. Test both paths.
- **PIPELINE_STEPS missing `signals` is a pre-existing UI bug.** Phase 1 fixes it incidentally — call this out in the commit message so it's not lost.
- **Non-strict modal must be modal-modal.** User cannot navigate away while the pipeline is paused mid-flight. Use existing modal infra (`src/renderer/components/modals.js` has the Modal primitive).
- **Pitch_spike WILL stall under Phase 1 stall-timer on the 30-min recording.** This is intended — Phase 4 fixes it. Don't soften the stall timer to "make it pass" — the whole point is the user gets a clear truth.
- **Strict mode default ON ships even though it'll abort the user's first big run.** That is the founder's explicit direction — "I don't even really want this fallback of lower quality." Don't soften.
- **Backstop formula is `max(60s, sourceDuration × 0.2)` — sourceDuration is seconds, result is also conceptually seconds. Convert to ms (× 1000) when feeding `setTimeout`. Easy to fumble.

---

## Resolved decisions (approved 2026-04-25)

1. **Modal mounts in App.js**, not UploadView — pipeline runs are long enough that the user must be able to switch tabs mid-flight.
2. **No "Open log folder" button.** Logging requirement instead: failure-reason lines (`stall after 30s`, `backstop fired at 412s`, etc.) plus a one-line completion summary (`signals_failed: pitch_spike (stall, 32100ms); ...`) written to `processing/logs/<videoName>.log` via the existing per-pipeline logger. App-level events to `%APPDATA%\clipflow\logs\app.log` as today.
3. **Settings copy locked.** Section: "Pipeline quality". Toggle label: "Strict mode". Description: *"Abort the pipeline if any audio signal fails. Recommended — your clips reflect every signal we promised. Turn off only if you want to ship clips even when signal extraction degrades."*
4. **Orchestrator-level crash counts as a strict-mode abort.** If `runSignalExtraction` itself throws (not from inside a per-signal subprocess), Phase 1 treats it as a single failed signal with `failedSignal: "extractor"`. Closes the silent-degradation hole at the wrapper level too.

**Approved — proceeding with implementation.**
