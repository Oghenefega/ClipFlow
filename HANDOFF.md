# ClipFlow — Session Handoff
_Last updated: 2026-04-27 — Session 31 — Issue #75 Phases 1–3 shipped. Lazy-cut pivot filed as #76, pick that up next._

---

## One-line TL;DR

Three stacked wins on the pipeline reference recording: **Clip Cutting 297s → 125s (2.4×), Clip Retranscription 215s → 81s (2.7×), Pipeline total 810s → 506s (1.6×, ~5 min faster every run)**. NVENC encoder + parallel cuts (concurrency=3) for #75's first half; single-Python-process batched retranscription for the second half. New strict "no silent CPU fallback" encoder setting (Auto / GPU / CPU) with live status in Settings. Issue #75's optimization halves are done; the architectural pivot ("lazy-cut") is filed as #76 and is the recommended next session.

---

## What just shipped (session 31)

### Issue #75 Phase 1 — NVENC encoder swap

**Files:** [src/main/ffmpeg.js](src/main/ffmpeg.js), [src/main/main.js](src/main/main.js), [src/main/preload.js](src/main/preload.js), [src/main/ai-pipeline.js](src/main/ai-pipeline.js), [src/renderer/views/SettingsView.js](src/renderer/views/SettingsView.js).

- Encoder is selectable: `clipCutEncoder` electron-store key, values `"auto"` | `"gpu"` | `"cpu"`, default `"auto"`. Migration adds the key on existing installs.
- `"gpu"` is **strict**: if NVENC isn't detected, the pipeline aborts with a clear error message ("Switch to CPU or Auto in Settings → Pipeline Quality"). Never silently falls back. This was a hard requirement from the user — they didn't want to think they were on GPU but actually be on CPU.
- `"auto"` uses NVENC if detected, otherwise x264. **Both pipeline log and on-screen progress text show which encoder ran every time** ("Cutting clip 7/15 (NVENC)..."), so the user is never confused about which path is active.
- NVENC args: `-c:v h264_nvenc -preset p4 -tune hq -rc vbr -cq 19 -b:v 0 -maxrate 25M -bufsize 50M -spatial_aq 1 -temporal_aq 1`. cq=19 ≈ crf=18 in software for visually-equivalent output.
- `cutClip` and `concatCutClip` accept new `opts` (`encoder`, `fps`). When fps is provided, the per-call probe is skipped — the AI pipeline used to call `probe()` 16× (Stage 0 + once per clip); now Stage 0's probe is threaded through, dropping the 15 redundant probes.
- All user-driven recut IPC handlers (`clip:extend`, `clip:extendLeft`, `clip:concatRecut`, `clip:recut`) also use the same encoder selection — editor recuts inherit NVENC.

**Measured:** 297.1s → 142.7s (2.08×, 154s saved) on the reference 30-min RL recording. Standalone bench: 17.65s (x264) → 9.43s (NVENC) on a single 60s 1080×1920 60fps clip.

### Issue #75 Phase 2 — Parallel cuts (concurrency pool)

**Files:** [src/main/main.js](src/main/main.js) (migration), [src/main/ai-pipeline.js](src/main/ai-pipeline.js) (cut loop), [src/renderer/views/SettingsView.js](src/renderer/views/SettingsView.js) (1–5 button row).

- `clipCutConcurrency` electron-store key, default 3, range 1–5. Migration adds the key.
- Stage 7 cut loop rewritten as concurrency-limited pool: N workers pull indices from a shared cursor; each task writes to a pre-allocated index-aligned slot; `project.clips` assembled in source order after the pool drains so `clip_001` stays first regardless of completion order.
- **Concurrency=3 is the sweet spot.** Standalone bench at 1/2/3/4: concurrency=3 gave 1.18× over sequential; concurrency=4 was identical (no further gain). RTX 30-series shares one NVENC silicon block across concurrent sessions — encoder bandwidth caps at ~3 sessions of useful work. Higher counts just split bandwidth without amortizing fixed costs.
- Settings UI dial lets users dial down to 1 if they ever see per-clip failures (no evidence of this on the 3090 reference machine, but if a future user has a lower-end GPU, NVENC session limits could matter).

**Measured:** 142.7s → 109.9s (1.30× on top of Phase 1) — Phase 2 verification run. The session-31 verification run measured 124.9s (run-to-run variance ±15s on the parallel path is normal; NVENC thermal/driver state). Average ~117s.

### Issue #75 Phase 3 — Batched retranscription (single Python process)

**Files:** [tools/transcribe.py](tools/transcribe.py) (batch mode), [src/main/ai/transcription/stable-ts.js](src/main/ai/transcription/stable-ts.js) (`transcribeBatch`), [src/main/whisper.js](src/main/whisper.js) (re-export + fallback), [src/main/ai-pipeline.js](src/main/ai-pipeline.js) (Stage 7b rewrite).

- `tools/transcribe.py` got a new `--batch <manifest.json>` arg. Manifest is `[{"audio": "...", "output": "..."}, ...]`. Helper `transcribe_one(model, audio, output, language, initial_prompt)` extracted so single-clip and batch paths share the per-clip work.
- The whole point: **load the model ONCE**, loop over the manifest. Pre-fix, each of 15 clips paid ~5-8s of Python startup + CUDA init + faster-whisper model load + stable-ts init = ~75-120s of pure overhead per pipeline run. Post-fix, ~8s once. The remaining work is actual whisper inference + refine() per clip.
- Each clip's output JSON is written immediately on completion. If Python crashes mid-batch, partial progress survives on disk — the JS caller reads what's there and flags missing outputs as `clip.transcriptionFailed`.
- Stage 7b in [ai-pipeline.js](src/main/ai-pipeline.js) rewritten: parallel audio extracts (concurrency pool, reusing `clipCutConcurrency` setting) → single batched transcribe call → assign results back, cleanup temp WAVs and JSON outputs. The lessons.md "never source-slice word timestamps" rule is preserved — every clip still gets transcribed against its own audio, just in one Python process instead of 15.

**Measured:** 214.7s → 80.7s (2.7×) on the reference recording. **15/15 clips transcribed successfully, no failures.** Standalone batch smoke on 3 clips: 29.2s for 3 clips of ~30-45s each, model loaded once.

### Settings UI

[src/renderer/views/SettingsView.js](src/renderer/views/SettingsView.js) — the existing "Pipeline Quality" card got two new rows:
- "Clip cutting encoder" — three-button segmented control (Auto / GPU / CPU) with caption text that changes based on the selected mode (the GPU caption explicitly says "Pipeline aborts with a clear error if NVENC isn't available — never silently falls back to CPU"). "NVENC detected: yes/no" status hint shown live.
- "Parallel cuts" — five-button row 1–5 (3 highlighted by default).

User confirmed in-app: settings render correctly, NVENC detected = yes, both controls work, editor recut still works, all 15 clips ship cleanly.

---

## Why the user's "lazy-cut" pivot is the right next move

The user raised this in session and was right: **eager-cutting 15 MP4s upfront is wasted work for clips they won't publish**. Phase 4 of #42 (already shipped) added `nleSegments` to clips so the render path uses source+segments — the cut MP4 is already half-redundant. Today it's only load-bearing for editor preview playback, retranscription audio extract, and thumbnail extract. All three can be source-direct.

**Net win projection:** Clip Cutting 124.9s → ~0s blocking (move to per-clip-at-publish, paid only on approved clips). Pipeline ~506s → ~390s. AND wasted cuts on rejected clips drop to zero — if you keep 10 of 15, you save 5 × 8s = ~40s of pure waste.

This is filed as **issue [#76](https://github.com/Oghenefega/ClipFlow/issues/76)** with full architectural spec. **Read that issue cold at the start of the next session — it's the blueprint.**

---

## Start the next session here

1. Run `gh issue list --repo Oghenefega/ClipFlow --state open --limit 50` for the current backlog.
2. **Recommended pickup: [#76 — lazy-cut architecture pivot](https://github.com/Oghenefega/ClipFlow/issues/76).** That's the architectural unlock. The issue body has the full piece breakdown (A/B/C/D), risk analysis, and acceptance criteria.
3. Other open candidates if not #76 immediately:
   - **[#74](https://github.com/Oghenefega/ClipFlow/issues/74)** — Hide pipeline internals UX. Smaller scope, must land before any external user runs the pipeline.
   - **[#73](https://github.com/Oghenefega/ClipFlow/issues/73)** — Cold-start UX. Independent of pipeline work.
   - **[#70](https://github.com/Oghenefega/ClipFlow/issues/70)** — Rename watcher rigidity.

---

## Logs / debugging

- **App log:** `%APPDATA%\clipflow\logs\app.log` — main process events, IPC errors, store mutations.
- **Pipeline logs:** `processing/logs/<videoName>.log` — per-pipeline-run stdout/stderr from every step. Session 31 added new lines: `Clip cutting: encoder=NVENC (setting=gpu)`, `Cutting 15 clips with NVENC, concurrency=3 (fps=60)`, `[INFO] Batch retranscription returned N/M`. All greppable.
- **Latest reference log:** [processing/logs/RL_2026-10-15_Day9_Pt1_1777321811452.log](processing/logs/RL_2026-10-15_Day9_Pt1_1777321811452.log) — full session-31 in-app verification with strict GPU mode + batched retranscription. Pipeline total 506.2s, all 6 signals green, 15/15 clips transcribed.
- **Standalone benchmarks (still on disk in `tmp/`):**
  - `tmp/nvenc-test/` — single-clip x264 vs NVENC + concurrency 1/2/3/4 timing artifacts.
  - `tmp/batch-smoke/` — manifest + 3 input WAVs + 3 output JSONs from the batch-mode smoke test. Useful as a reference manifest format for #76.
- **DevTools live signal events:** `window.clipflow.onSignalProgress((d) => console.log(d))`.

---

## Watch out for

- **Don't change `cutClip`'s default `opts.encoder` away from `"x264"`.** It's deliberately the safe default so any future caller that forgets to pass an encoder gets the original behavior, not a surprise NVENC dependency. The AI pipeline + recut IPC handlers explicitly resolve from the setting and pass it. Anything new should do the same.
- **Don't strip the `"gpu"` strict-fail behavior** in `resolveEncoder`. The user explicitly asked for "no silent fallback" — if NVENC is missing in GPU mode, throw. Auto mode handles the fallback case loudly.
- **NVENC output is ~50% larger than x264 at notional-equal quality** (151MB vs 101MB on a 60s 1080×1920 60fps test clip at NVENC cq=19 vs x264 crf=18). Visually equivalent for social. If a future requirement cares about file size, switching the default to `"cpu"` is one line.
- **Run-to-run variance on parallel cuts is ±15s.** NVENC thermal/driver state. Don't chase a single-run number; average across two runs.
- **The batched retranscription script writes per-clip JSON outputs immediately.** If you change the cleanup logic in [ai-pipeline.js](src/main/ai-pipeline.js) Stage 7b, make sure failed clips still get their JSON deleted (the current code uses try/unlinkSync in the per-task assignment loop — keep it that way).
- **`refine()` in stable-ts is the residual cost.** ~5s per clip. Doing 15 clips × ~5s of iterative re-inference is ~75s of the remaining 80.7s retranscription budget. Lazy-cut doesn't change this; an additional optimization (skip-refine on segment-aligned clean clips) is mentioned in #76's notes as a follow-up.
- **Issue #75 is partially closed.** The optimization halves are done; the architectural pivot is #76. Don't close #75 yet — close it when #76 lands and we can mark "Pipeline cutting + retranscription performance" as fully resolved.

---

## Session model + cost

- **Model:** Sonnet 4.6 → Opus 4.7 mid-session for the architectural rethink and the lazy-cut spec.
- **Files committed this session:** ~7 source files + CHANGELOG.md + HANDOFF.md.
- **Issues filed:** [#76](https://github.com/Oghenefega/ClipFlow/issues/76) — lazy-cut architecture pivot.
- **Issues partially closed:** [#75](https://github.com/Oghenefega/ClipFlow/issues/75) — optimization halves shipped, architectural half delegated to #76.
