# HANDOFF — Session 177 (2026-08-20)

## Current State
**#271 (audio wizard redesign) is built, E2E-verified, and on master.** It's the
first of the approved four-issue batch **#271 → #270 → #272 → #273** (order
approved by Fega this session; full plans for all four live in `tasks/todo.md`
under "PLANNED (session 177)"). #271 rides the next installer cut alongside
session 176's #263/#269 (batch rule). Not yet in any installer — Fega hasn't
seen it in-app.

## What Was Just Built
- **Editor-style calibration wizard** (`src/renderer/components/AudioCalibrationModal.js`,
  full rewrite): muted video anchor + one lane per track with its real waveform
  (peaks come back with each 20s sample — `audio:extractTrackSample` now also
  runs `extractWaveformPeaks` on the extracted WAV, main.js), sweeping playhead
  driven by the video clock, lane click = solo with mid-play continuity (audio
  swaps tracks at the same position).
- **Per-lane waveform normalization** — E2E against Fega's real RL recording
  measured ~-31 dBFS peaks; unnormalized lanes rendered flat. Each lane scales
  to its own max; lanes under ~-60 dBFS stay flat as genuinely silent.
- **Label renames** (display only, value keys untouched): Full Mix / Mic /
  Game/Desktop / Comms ("e.g. Discord") / Music + new **browser** value key.
  Single source of truth: new `src/renderer/audioTrackLabels.js`
  (LABEL_OPTIONS + trackLabelText) — replaced the modal's list and BOTH
  duplicated LABEL_TEXT maps in SettingsView.
- **Custom names for "Other" tracks**: inline input in the wizard; persisted as
  `{index, label:"other", customName}` (main.js sanitizes: control chars
  stripped, trimmed, 24-char cap, only on label "other"). Shows in the wizard
  rail and both Settings pickers via trackLabelText.
- **Prefill on recalibrate**: modal seeds labels/customNames from stored
  audioSetup via storeGet — ONLY when trackCount matches (mismatched layout =
  stale labels = dangerous defaults; starts blank on purpose).
- `AUDIO_CAL_LABELS` allow-list (main.js:1501) gained "browser" — any new
  value key MUST be added there or saves silently strip the track.

## Key Decisions
- **Variant C evolved into "editor-style" per Fega's direction** ("track stuff
  should feel like it exists on an editor" + video shown + per-track
  visualizer). Waveform-per-lane chosen over live meters: informative while
  paused, flat-lane = silent at a glance, reads like an NLE.
- Prefill gated on matching trackCount (wrong-default-blindly-confirmed
  principle from #263 applies here too).
- "Flat lanes are probably Empty" helper was REJECTED after E2E: Fega's mic was
  silent in the first sample window. Copy now steers to "Try another part".

## Next Steps
1. **#270 (per-word caption styling) — next session**, per approved batch
   order. Full plan + exploration findings in todo.md (two hand-synced render
   loops, three persistence whitelists, no stable word IDs — read it first).
2. Then #272 (per-track volume; architecture decision recorded in todo.md),
   then #273 (volume keyframes; mock the interaction first).
3. Installer cut when the batch feels full → Fega's in-app passes: #271
   (Settings → Recalibrate: editor-style wizard, prefill arrives filled,
   custom name survives), plus standing #263/#269/#264/#267 checks.

## Watch Out For
- **Prefill is the one #271 surface not E2E-verified** — the Settings
  Recalibrate path needs the native file dialog, which CDP can't drive. Code
  path is small (one effect, storeGet + seed). Fega's pass covers it.
- The pipeline-gate path deliberately CANNOT prefill: the gate only fires on
  trackCount mismatch, prefill only seeds on match. Not a bug.
- Wizard "Done" completes the gate and the pipeline PROCEEDS — in E2E always
  exit via Cancel or the run starts a real generation.
- Old "unknown" labels prefill as unlabeled (skipped on seed) — re-picking Mic
  elsewhere still demotes the previous voice track to "unknown" (parity).
- `%APPDATA%\Corva` on the DESKTOP is an empty dir; desktop prod data still
  lives in `%APPDATA%\clipflow` (migration evidently hasn't run here — desktop
  daily driver may not have booted alpha.60 yet). Don't assume Corva paths on
  this machine; check both.

## Logs/Debugging
- Calibration saves log under module `system` in app.log: `[audiocal]
  calibration saved: N tracks, voice=track N`.
- Sample WAVs cache in `%TMP%\clipflow-audiocal\` (`<md5>-tN-<pct>.wav`),
  deleted by the modal's unmount cleanup (`audio:cleanupSamples`).
- E2E harness pattern (session scratchpad `cdp-wizard-e2e.js`): launch
  `CLIPFLOW_PROFILE=dev npx electron . --remote-debugging-port=9222
  --disable-features=CalculateNativeWinOcclusion`, fire the REAL gate via
  `window.clipflow.generateClips(<multi-track file>, {})` with dev audioSetup
  null → wizard mounts through production code; scope ALL DOM queries to the
  overlay (zIndex 1100) — unscoped queries hit the Rename tab behind it and
  clicks pass through the overlay to background handlers; `innerText`
  comparisons must be lowercased (section headers are CSS-uppercased);
  cancel sets a 60s re-prompt cooldown between runs. Settings groups collapse
  by default — expand by clicking the "Show" leaves, not the header text.
- Dev-profile state fully restored after E2E: audioSetup null,
  transcriptionAudioTrack 0 (matches pre-test file + all backups).
