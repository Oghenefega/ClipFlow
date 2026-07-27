# ClipFlow — Session Handoff

_Last updated: 2026-07-27 — Session 132 — **Game-audio track signals shipped (#190): detection finally hears the game. Closed `status: untested`, commit 59f14b5. Not yet in an installer — Fega's daily driver (alpha.20) does not have it.**_

---

## One-line TL;DR

The pipeline can now extract a second audio track (the game) and run two new signals on it — `game_energy` (distribution-relative RMS spikes) and `game_yamnet` (YAMNet with Speech/Crowd + peak-normalization) — merged into the event timeline with renormalized archetype weights, plus reserved frame slots so quiet-mic game moments finally get photographed. Off by default; single-track behavior proven byte-equivalent to before. Verified end-to-end on a real RL recording where the two loudest game-track windows turned out to be a goal and a save.

## Current State

- **#190 closed `status: untested`** (full verification evidence in the closing comment). Commit `59f14b5` pushed.
- **No installer cut** — per the batch-versions rule. The feature reaches Fega's daily driver with the next promotion; until then his real runs are unaffected (setting defaults to off via migration, verified on a dev-profile boot).
- Unit test green: `node src/main/signals.test.js` — all 4 archetype rows sum to 1 AND redistributing away the game keys restores the pre-#190 weights exactly.
- Renderer built (`npm run build:renderer`) with the two view changes; dev-profile boot verified the `gameAudioTrack: null` migration writes.
- **#199 filed** (found during verification): `energy_scorer.py` hardcodes `-map 0:a:1` — genuinely single-track sources abort at Stage 4 today (pre-existing, unrelated to #190), and `transcriptionAudioTrack` is ignored by energy analysis.

## What Was Just Built (#190)

- **Setting + UI:** `gameAudioTrack` (null = off) in main.js defaults + migration; picker in Settings under the transcription track (Off + Track 1..N, calibration labels shown, voice track disabled with tooltip). [main.js, SettingsView.js]
- **Second extraction:** Stage 2 probes audio tracks and extracts the game track to `game_audio.wav` — `extractAudio` gained `{ fallbackToFirst: false }` so a failed game extraction skips rather than silently analyzing the mic. Skip ladder (off / same-as-voice / single-track / missing index / extraction failure) logs ONE line each and never aborts. [ai-pipeline.js, ffmpeg.js]
- **game_energy:** streaming WAV reader + 1s RMS windows in signals.js; spike floor = the recording's own 98th-percentile window (median baseline, 0.001 audibility floor, 1.25× contrast guard for flat tracks); score maps [floor→max] to [0.5→1.0]. Gain-invariant — critical because Fega's game track sits at ≈ -52 dBFS and goals peak at only ~2.1× median (fixed multipliers found NOTHING on real data).
- **game_yamnet:** same yamnet_events.py, new `--extra-classes Speech,Crowd` and `--normalize` (peak-normalize; raw quiet track scored ~0 on everything, normalized the goal scored Explosion 0.33–0.67). Mic run passes neither flag. Event classes exclude Music/Silence deliberately.
- **Timeline merge + weights:** events tagged `game_energy` / `game_yamnet`; archetype tables extended (mic × 0.85 + 0.10/0.05) — absent game signals are redistributed away, restoring the original split exactly. Game signals are NEVER pushed into `signals_failed`, so the strict/degrade gate cannot fire over them (failures land in `failure_details` for grepping). [signals.js]
- **Frames:** `extractTopFrames` reserves up to 4 of 20 slots for game events not covered by any transcript segment (energy segments are transcript-derived — a silent-mic goal had NO segment and could never be photographed; 17 of 56 game events fell in such gaps on the test recording). [ai-pipeline.js]
- **Prompt:** one explainer line in the timeline section only when game signals ran; mic-only prompts stay byte-identical. [ai-prompt.js]
- **Signal-health UI:** two extra rows appear in the Recordings signal table only when the pipeline emits them. [UploadView.js]

## Key Decisions

1. **Percentile thresholds, not multipliers** — real OBS game tracks are quiet and compressed; every threshold derives from the recording's own distribution (issue asked for "baseline-relative"; measurement forced this stronger form). The two loudest windows on the real recording were the goal and the save, so the signal is validated, not assumed.
2. **Weights scaled by exactly 0.85** so `redistributeWeights` restores pre-#190 values with zero float drift (verified in run output: `0.55/0.15/0.1/0.05/0.1/0.05` exact).
3. **Game-signal failures degrade silently by weight renormalization** — the issue's "graceful skip, never abort" wins over strict-mode's "no silent degradation" for these two signals only.
4. **Reserved frame slots (4/20)** — deviation from the issue's "no extra code" item 5, which assumed segments tile the recording; they don't.
5. **Music excluded from game event classes** — continuous background music carries no moment-level information.

## Next Steps

1. Fega turns the feature on (Settings → Game Audio Track → Track 3 "Game / desktop") and runs a real RL generation; watch approval rate against the 6.5% baseline over the next sessions (the epic tracks the metric).
2. On his confirmation: remove `status: untested` from #190.
3. #199 (energy_scorer track hardcode) — quick fix, unblocks true single-track users and makes energy analysis respect `transcriptionAudioTrack`.
4. Next installer cut picks all of this up (tools/ ships via extraResources — the yamnet_events.py changes ride along automatically).

## Watch Out For

- **game-profiles.js writes to REPO `data/game_profiles.json` when unpackaged** — headless harness runs increment real sessionCount (3 fake increments reverted this session via `git checkout`). Any future harness runs: revert `data/game_profiles.json` after, or stub `gameProfiles`.
- **yamnetSilenceSkip=false in Fega's prod settings** — both YAMNet passes run full inference (~230s each on 30 min, concurrent so ~zero added wall time). If he ever flips silence-skip back on, the game track's normalized audio makes the RMS pre-filter behave sanely (skip is computed post-normalization).
- The `--extra-classes` / `--normalize` flags are additive; the packaged app ships `tools/signals/` fresh on next build — no stale-asar concern, but confirm with `npx asar list` if anything looks off after the next installer.
- Single-track sources still die at Stage 4 in `energy_scorer.py` (#199) — that failure is NOT the #190 skip path; the skip line ("Game audio: source has 1 audio track(s)") appears well before it.
- Harness pattern for headless full-pipeline runs lives in this session's scratchpad (`run190-harness.js`): electron + `app.setPath("userData", …)` + stub store over prod `clipflow-settings.json` + self-registering providers. Runs cost one real Claude call (~$0.13) each.

## Logs / Debugging

- Verification runs (session scratchpad `run190-*/`): `run190-multi3/` is the definitive multi-track run — `processing/signals/…event_timeline.json` (8 signals computed, 0 failed, 56 game events), `processing/frames/…frame_17.jpg` (silent-mic goal-mouth play at 21:24, game_energy 0.84), frame_01 = the 4:07 goal (composite 0.780, game_energy boost 1.0). `run190-twotrack/` is the mic-only equivalence run (weights exactly pre-#190, 6 signals, no game events).
- Per-run pipeline logs: `<scratchpad>/run190-*/processing/logs/*.log` — grep `Game audio:` for the skip/extract lines, `Reserving` for frame slots, `signals_complete` for the computed/failed summary.
- Real recording used: `W:\YouTube Gaming Recordings Onward\Recordings\2026-07\2026-07-22 RL Day10 Pt2.mp4` (goal at 4:07 "FEGA YT SCORED!", save at 2:16, silent-mic goal-mouth play at 21:24). Temp single/two-track test files on W: were deleted.
- Unit test: `node src/main/signals.test.js`.
