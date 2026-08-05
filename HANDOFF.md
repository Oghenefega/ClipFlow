# ClipFlow — Session Handoff

_Last updated: 2026-08-05 — Session 149 (#235 Gemini watch: integrated → gated → parked default OFF; installer **0.3.0-alpha.38** cut and INSTALLED by Fega; four verdicted keeper clips injected into their projects)._

---

## One-line TL;DR

The Gemini full-watch is now real pipeline code (`src/main/gemini-watch.js` + background stage in ai-pipeline) but **parked default OFF by Fega's gate call**: its integration cell came in at 22/26 pooled recall vs f10-mix's 25/26, the EO Day3 −2 proved systematic (pick-budget squeeze), and his 13 eyeball verdicts cross-checked against f10-mix showed every keeper is found WITHOUT gemini too (post-#237 the de-saturated timeline surfaces the same territory — gemini's D2/D3 "uniqueness" was an artifact of the old saturated list). Installer alpha.38 shipped the whole sessions-144-149 batch and Fega confirmed v38 installed; his four new verdicted keepers were injected as real clips into their projects.

## Current State

Master pushed. Daily driver = **0.3.0-alpha.38** (confirmed installed) — carries #232 v3 chips (LIVE: Fega should tag every rejection now), frames 10, #236, #237, and the dormant gemini watch. Epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) open. [#235](https://github.com/Oghenefega/ClipFlow/issues/235) **CLOSED** (full arc + all 28 verdicted picks recorded in its comments). NEW: [#238](https://github.com/Oghenefega/ClipFlow/issues/238) (pick-budget scaling + cut-boundary extension — the gemini re-earn path), [#239](https://github.com/Oghenefega/ClipFlow/issues/239) (published clip missing from feedback DB — approval paths outside the Pending tab don't write training rows). [#234](https://github.com/Oghenefega/ClipFlow/issues/234) still open (post-#232 no-rejected re-test — NOW UNBLOCKED for data collection since the chips are live).

## What Was Just Built (session 149)

- **`src/main/gemini-watch.js` (NEW):** proxy transcode (720p NVDEC/NVENC), Files-API upload + long poll, v2-actor watch prompt (FROZEN verbatim), actor-aware `classifyActor`/`mergeVisualEvents` (spectator-drop, raw-confidence merge). Artifact → `processing/signals/<vid>.visual_events.json`.
- **ai-pipeline.js:** watch starts in background right after probe, awaited before the Claude call, merges only into the event timeline (frames untouched); failure never aborts. **Default OFF** — runs only with `geminiWatchEnabled: true` + a key; test mode always skips.
- **gemini provider:** `uploadFile` timeout opts (titlegen defaults unchanged), `video_ref` content block, `uploadFile`/`deleteFile` exported. **pipeline-logger:** `logApiUsage` now ACCUMULATES (Gemini + Claude in one cost line).
- **Harness `--gemini` requires the prod merge functions** (inline copy deleted — cells measure shipped code); spike `gemini-watch.js` is a thin CLI over the prod module (+ `--master` for archived recordings). 14 new unit tests (74 green).
- **Cells:** f10-gemInt on all six recordings (+3 noise runs) — pooled 22/26; per-run diagnosis in #235. New v2 watches: RL Day8 (13 events), EO Day3 (7), RL Day9 re-watch (0 — no-hallucination holds).
- **Installer 0.3.0-alpha.38** cut, pushed, installed.
- **Clip injection (post-build):** EO Day3 got Clip 16 (1:01 egg-slide), Clip 17 (14:13→14:55 rage-quit, start pre-extended 15s), Clip 18 (24:32 chat-alone); RL Day8 got Clip 17 (11:45 "afraid of you"). All status `none`, starter subs sliced from source transcript, thumbnails generated. Backups: `project.json.bak-s149` in both project dirs. The 5th keeper already existed — "ANKLES BROKEN" published Jul 23 (→ #239).

## Key Decisions

- **Gate call (Fega): default OFF.** Post-#237 the signal adds no unique territory on mic-heavy recordings and systematically costs ~2 keeps on the densest one. Re-earn path = #238 and/or a re-test on a recording with a known quiet-but-spectacular moment (the designed niche — UNSAMPLED, so unproven not refuted).
- **The de-saturation insight:** gemini's apparent D2/D3 uniqueness was the saturated timeline suppressing the mic signals. Any future "signal X finds new territory" claim must be cross-checked against the current no-X variant before crediting X.
- v2-actor watch prompt stays frozen; detection-prompt changes (#238) are the sanctioned lever.
- Injected clips start as `none` so Fega's Pending-tab approval writes real feedback rows (the only path that does — #239).

## Next Steps

1. **Fega:** tag a reason chip on EVERY rejection (v3 chips now live — this feeds the queued #234 re-test); editor-pass the four injected clips (retranscribe each → fine-tune EO Clip 17's start → approve on Pending tab → title/render/queue). Don't re-post "ANKLES BROKEN".
2. **#238** pick-budget scaling + cut-boundary extension — next experiment session; also the gemini re-earn gate.
3. **#239** feedback-path audit + backfill sweep (changes harness truth counts — re-pull before the next cell comparison).
4. #234 no-rejected re-test once v3-tagged rows are a meaningful share of the 50-row windows.

## Watch Out For

- **`geminiWatchEnabled: true` is the only switch** for the live watch — everything else (key present, non-test) already passes. Harness `--gemini` ignores the flag (always merges).
- **Approving the injected clips changes harness ground truth** for EO Day3 / RL Day8 — re-pull truth before comparing future cells to this session's numbers (standard caveat, now concrete).
- **Injected clips have source-sliced starter subs** — retranscribe in the editor before rendering (segmentation lessons apply).
- The proxy cache (`tasks/spikes/replay-score/_tmp/proxy/*`, ~600MB now incl. RL Day8 + EO Day3) is gitignored and safe to delete; prod deletes its proxies automatically after each watch.
- `results/_summary.json` pools run1 files only; f10-gemInt's run2/run3 files (RL Day10 ×3, EO Day3 ×3, DD ×3) are noise-check evidence, not pooled.
- Desktop folders: `ClipFlow Eyeball f10-gemInt` (safe to delete) — the four keepers are now real clips.
- EO Day3's master lives in `Vertical Recordings Onwards\2026-02\` (archived tree) — never re-add to the watch tree; spike CLI has `--master` for such recordings.

## Logs & Debugging

- Watch pipeline lines: `%APPDATA%\clipflow\processing\logs\<vid>_*.log` — "Gemini watch:" prefix (skip reason, transcode time, upload size, event count, cost); cost line now shows Gemini + Claude combined.
- Harness: `cd tasks/spikes/replay-score && node harness.js "<vid>" --frames 10 [--gemini] [--label cell]` (`--dry` free) · watches: `node gemini-watch.js "<vid>" [--master <path>]`.
- Unit tests: `node src/main/ai-prompt.test.js` (60) · `node src/main/gemini-watch.test.js` (14).
- Session API spend (external): $0.45 Gemini + ~$1.06 Claude ≈ **$1.51**.
- Feedback DB: `%APPDATA%\clipflow\data\clipflow.db` (repo copy STALE). Boot-verify: `CLIPFLOW_PROFILE=dev npx electron .`
