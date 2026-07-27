# ClipFlow — Session Handoff

_Last updated: 2026-07-27 — Session 132 — **#190 game-audio signals shipped and verified on prod (alpha.21); #200 clip-count saga landed on: 10-20 floor restored, short recordings fill with distinct clips, empty results banned (alpha.24). Installed daily driver: 0.3.0-alpha.24.**_

---

## One-line TL;DR

The pipeline can now extract a second audio track (the game) and run two new signals on it — `game_energy` (distribution-relative RMS spikes) and `game_yamnet` (YAMNet with Speech/Crowd + peak-normalization) — merged into the event timeline with renormalized archetype weights, plus reserved frame slots so quiet-mic game moments finally get photographed. Off by default; single-track behavior proven byte-equivalent to before. Verified end-to-end on a real RL recording where the two loudest game-track windows turned out to be a goal and a save.

## Current State

- **#190 closed, `status: untested` REMOVED** — verified on Fega's own installed alpha.21 run (game track extracted, 8 signals green, game events + reserved frame). He turned the setting on himself (Track 3).
- **Four installers shipped this session:** alpha.21 (#190), alpha.22 (#200 free count — reverted), alpha.23 (borderline inclusion + zero-clip banner), **alpha.24 (final: 10-20 floor restored)**. Fega's daily driver = alpha.24.
- **The #200 clip-count saga (read before touching the count prompt again):** alpha.21's hard floor made a 69s recording yield 10 overlapping duplicates → alpha.22 removed the floor → model (correctly, per Fega's own "it's just me training, it's boring content" rejection note) returned 0 clips → Fega: empty results starve the review/training loop, revert. **Landed design (alpha.24): "Return 10 to 20 clips" verbatim + short recordings fill with as many DISTINCT non-overlapping clips as physically fit (below-the-bar picks at honest low confidence) + empty array banned + overlap ban + recording-length line in the prompt.** Verified 2× on the 69s repro: 4 distinct clips, conf 0.5-0.72. See tasks/lessons.md 2026-07-27: never let detection return empty for Fega — he is the precision filter; volume of reviewable material IS the product.
- Unit tests green: `node src/main/signals.test.js` (weights) and `node src/main/ai-prompt.test.js` (44 assertions incl. floor/overlap/empty-ban).
- **#199 filed** (found during verification): `energy_scorer.py` hardcodes `-map 0:a:1` — genuinely single-track sources abort at Stage 4 (pre-existing), and `transcriptionAudioTrack` is ignored by energy analysis.
- Zero-clip completion banner + real signal-count badge shipped in UploadView (alpha.23) — mostly unreachable now that empty results are banned, but correct if they ever fire.
- The final 30-min sanity run for alpha.24 backstopped twice on yamnet — machine contention (71% CPU from Fega's own use), not code; the long-recording instruction is pre-#200 verbatim and two earlier 30-min runs with the overlap ban were green (15 clips / 0 overlaps). Fega's next real session is the definitive check.

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

1. **Fega retests the 69s recording on alpha.24** — expect ~4 distinct clips, never empty, no duplicates. If he still wants the literal old duplicates-allowed behavior, it's one line (drop the overlap bullet in ai-prompt.js DO NOT list).
2. **Watch approval rate on RL vs the 6.5% baseline** over the next real sessions with the game track on (the #190 epic tracks the metric). His first impression of game-signal picks: "different, not so bad".
3. **#200 is closed but `status: untested` on the alpha.24 design** — confirm his verdict on the restored floor before considering it settled.
4. #199 (energy_scorer track hardcode) — quick fix, unblocks true single-track users and makes energy analysis respect `transcriptionAudioTrack`.
5. Confirm a clean full-session (30-min) generation on alpha.24 whenever Fega next generates — closes the contention-blocked sanity check.

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
