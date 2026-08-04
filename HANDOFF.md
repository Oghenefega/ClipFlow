# ClipFlow — Session Handoff

_Last updated: 2026-08-04 — Session 148 (#237 event-timeline de-saturation shipped + gated; #235 integration gate CLEARED) — **no installer cut; the pending batch still carries the v3 reason chips (#232), frames 10, #236, and now the #237 selection change.**_

---

## One-line TL;DR

The prompt's top-50 event list was decided by a giant score tie (three mic signals pin hundreds of events at exactly 1.00; pitch_spike "won" by array insertion order). New `selectTimelineEvents` in ai-prompt.js caps each signal at 10 lines, collapses same-signal windows within 10 s, and backfills when few signals exist — verified on all six harness recordings (pooled recall 24/26 → **25/26**, precision flat), 60 unit tests green, and the harness's Gemini score-ceiling hack is retired (all 9 RL Day10 visual events land at raw 0.72–0.88 confidence). #237 closed `status: untested`; #235 pipeline integration is now unblocked.

## Current State

Master pushed. Epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) open. [#237](https://github.com/Oghenefega/ClipFlow/issues/237) **CLOSED** (`status: untested`) — full results in its closing comment. [#235](https://github.com/Oghenefega/ClipFlow/issues/235) open — integration gate cleared, next step is real pipeline wiring behind its own ablation cell. [#234](https://github.com/Oghenefega/ClipFlow/issues/234) open — only the queued post-#232 no-rejected re-test remains. No installer cut (batching rule).

## What Was Just Built (session 148)

- **`selectTimelineEvents` (src/main/ai-prompt.js) — #237:** best-score-first walk with a 10-line-per-signal cap, same-signal midpoint dedup at 10 s (mirrors the #190 frame-reservation rule), backfill past caps when slots stay open. Selection-only: score formulas, composite segment scores, and frame selection untouched. Section header now reads "max 10 per signal, nearby duplicates collapsed". Exported for tests + harness.
- **Diagnosis recorded (spec §Step 5):** saturation is 3 signals, not 1 — RL Day10 has pitch_spike 167 / reaction_words 250 / transcript_density **781 of 781** events at exactly 1.00. The old top-50 was "the 50 earliest pitch windows", ordered by accident.
- **Harness ceiling hack retired:** `--gemini` merges visual events at raw Gemini confidence; merge log prints how many land in the section.
- **8 new unit tests** (`node src/main/ai-prompt.test.js` — 60 green): caps, dedup, cross-signal non-collapse, backfill, sub-1.0 signals landing through tie walls, buildUserContent mix.
- **Harness cells:** `f10-mix` on the six standard recordings — pooled recall 25/26 = 96% (f10 record: 24/26), rejected-hit 41/83 = 49% (f10: 48%). `f10-gemD4` on the three gemD3 recordings — 10/12 pooled; the delta vs gemD3's 11/12 is entirely RL Day10's single approved row (22:14), caught 1 of 3 runs (see Watch Out For). EO Day4's persistent miss is the same row in gemD3/gemD4/mix; old f10 was worse there (4/6).
- Pooled rows `f10-mix` + `f10-gemD4` added to `results/_summary.json`. Dev-profile boot verified after the main-process change.

## Key Decisions

- **Cap+collapse over rescaling:** rescaling score formulas would move composite scores and frame selection too (re-litigates locked #190 behavior); the fix stays inside prompt-line selection.
- **Backfill ignores caps** once every signal got its top-10 — mic-only recordings keep ~50 informative lines instead of rendering 22.
- **RL Day10 gemD4 flakiness is a #235 integration watch item, not a #237 blocker:** the missed row's timeline line (game_energy 0.73 @ 22:01) IS in the selection; gemini displaced only junk lines (redundant 1.00 pitch duplicates, 0.33–0.41 game_yamnet). Mechanism = pick-budget competition — the model returns 15 picks, the row ranked #11–13 whenever caught, and gemini's new-territory picks (incl. two Fega verdicted usable in D3) outrank it.
- Known limitation (documented, not fixed): within a 1.00 tie block the capped picks are the earliest distinct windows → saturated signals' lines lean toward the video start. Baseline had the same bias on all 50 lines.

## Next Steps

1. **#235 pipeline integration** (now unblocked): lift the long Files-API poll into the prod Gemini provider, proxy transcode stage, actor filter in the pipeline merge — behind its own ablation cell, carrying the RL-knife-edge watch item. Candidate follow-on: cut-boundary extension (include cause + payoff in pick windows).
2. **Cut the batched installer** when Fega asks (carries #232 v3 chips, frames 10, #236, #237 selection) — then his hands-on check (reject a clip on Pending, 10 chips render).
3. **Queued:** post-#232 `--no-rejected` re-test once v3-tagged rejections are a meaningful share of the 50-row window (blocked on the installer shipping).

## Watch Out For

- **RL Day10 has exactly 1 approved row** — recall on that recording is binary and demonstrably flaky under the gemini merge (0/1, 0/1, 1/1 across three gemD4 calls). Never read a single RL Day10 run as signal; pooled numbers only.
- **`--runs N` overwrites run1**: re-running a cell with `--runs 2` replaced the original gemD4 run1 file (same 0/1 verdict, so no record lost — but remember before re-running cells whose run1 you want to keep).
- **`_summary.json` pools `__run1` files only** and is hand-maintained (no generator script) — update it when adding cells.
- **Truth counts shift when Fega reviews clips mid-session** — re-pull truth before comparing cells (RL Day10 now 13 rejected rows vs 9 at D2 time; recall comparisons stand, cross-time rejected-hit comparisons don't).
- **v1 vs v2 Gemini event files:** check `promptVersion` (absent = v1); v1 and v2 watches are different observations, not relabeled events.
- **Proxy cache:** `tasks/spikes/replay-score/_tmp/proxy/*.proxy.mp4` (gitignored, ~380MB) — safe to delete.
- **gemini-watch.js is spike-only** — lift the Files API upload properly at integration time (prod provider's 90 s poll is too short for 30-min proxies).
- Harness fidelity caveats from session 144 still apply (ground truth only covers surfaced moments; ±1 pick noise; pooled comparisons only).

## Logs & Debugging

- **Harness:** `cd tasks/spikes/replay-score && node harness.js "<videoName>" --dry` (free) · live ~$0.08–0.12 · gemini variant: `node harness.js "<vid>" --frames 10 --gemini --label <cell>` — merge log prints actor counts AND how many gemini lines land in the event section (raw scores, no ceiling).
- Results: `tasks/spikes/replay-score/results/`, pooled: `results/_summary.json`, Gemini events: `gemini/*.visual_events.json` (check `promptVersion`).
- Unit tests: `node src/main/ai-prompt.test.js` (60 tests).
- **Real prompts per generation:** `%APPDATA%\clipflow\processing\claude\<video>.system_prompt.txt`; token/cost lines in `%APPDATA%\clipflow\processing\logs\`.
- **Feedback DB:** `%APPDATA%\clipflow\data\clipflow.db` (repo `data/` copy is STALE). Reject-reason tags are comma-separated in `reject_reasons` (not JSON).
- Boot-verify after main-process changes: `CLIPFLOW_PROFILE=dev npx electron .` (daily driver's single-instance lock makes plain `npm start` exit 0 silently).
