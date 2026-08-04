# ClipFlow — Session Handoff

_Last updated: 2026-08-04 — Session 146 (Detection science: frames 20→10 shipped+verified, ablations complete, Gemini variant D run, #236 fixed, #237 filed) — **no installer cut; chips v2 + frames change + #236 ride the next batch.**_

---

## One-line TL;DR

Both of Fega's open decisions closed (frames 20→10 approved, Gemini billing flipped to paid), so this session shipped: the 10-frame default in the pipeline (verified with two replays on the recordings where the #190 reserved frames actually fire — recall held at 100%), the last two single-input ablations (approved examples are the only non-frame input that moves recall; play style is a precision guard), the #236 placeholder-title fix, and the first real Gemini full-recording watches (#235 variant D) — recall at ceiling AND new high-confidence picks landing exactly on Gemini-flagged plays, with integration gated on newly-filed #237 (the prompt's event timeline turns out to be 100% saturated pitch_spike lines).

## Current State

Master pushed (session commits: `f19165d` + the wrap commit). Epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) open. Children: #232 chips v2 + #233 harness (closed `status: untested`), [#234](https://github.com/Oghenefega/ClipFlow/issues/234) ablations (open — all single-factor cells DONE except the queued post-#232 no-rejected re-test), [#235](https://github.com/Oghenefega/ClipFlow/issues/235) Gemini full-watch (open — prototype RUN, results + Fega's eyeball list in comments), [#236](https://github.com/Oghenefega/ClipFlow/issues/236) title noise (closed `status: untested`), [#237](https://github.com/Oghenefega/ClipFlow/issues/237) pitch-spike saturation (open, NEW). No installer cut — batching rule; the pending batch now carries chips v2 (#232), frames 10 (this session), and #236.

## What Was Just Built (session 146)

- **Frames 20→10 shipped ([ai-pipeline.js](src/main/ai-pipeline.js) Stage 5)** — `extractTopFrames(..., 10, ...)`; #190 reservation unchanged at `min(4, topN)`. Verified per the locked rule with 2 `f10-verify` replays on the two recordings where reservation fires: RL Day10 Pt1 recall 1/1, DD Day2 Pt1 recall 5/5 (beat its baseline 4/5). Dev-profile boot verified.
- **Harness `deriveFrames` rewritten** to mirror the shipped selection (top N−R composite + R reserved, paired to disk jpgs by rebuilding the disk-order list; disk frame count auto-detected so future 10-frame artifacts replay correctly). Pre-2026-08-04 f10 cells were top-10-composite-only — the old caveat, now closed.
- **Ablations complete (#234):** `--no-approved` → recall 85%, rej-hits 55% (approved section works on BOTH axes); `--no-playstyle` → recall 88%, rej-hits 57% (worst precision of any cell — play style is a precision guard). Posted to #234, spec table updated.
- **#236 fixed:** `formatRealClipEntry` emits `Title:` only for real titles (placeholder `/^Clip \d+$/` and empty suppressed when a snippet exists). Real-DB RL prompt: 7 placeholder lines → 0. 52/52 tests green (2 new).
- **#235 variant D run:** `tasks/spikes/replay-score/gemini-watch.js` (NVDEC/NVENC 720p proxy → Files API → gemini-3.6-flash visual events) + `harness.js --gemini` (merges as `gemini_visual`). 4 recordings watched (~$0.63): RL Day10 18 events, DD Day2 9, EO Day4 9, RL Day9 **0** (quiet 4-min recording — honest null). Replay cell `f10-gemD2`: pooled recall 11/12 vs 10/12 for baseline AND f10 on the same recordings; new never-reviewed picks land exactly on Gemini's flagged moments (RL OT winner 18:29→19:10 conf 0.93, DD finish-line crash 01:55→02:15).
- **#237 filed:** the prompt's top-50 event list is 100% `pitch_spike` at score 1.0 on real recordings — game_energy/game_yamnet/reaction_words lines NEVER render (they act only via composite scores + frame reservation). Found because Gemini events initially couldn't crack the top-50; variant D worked only via a ceiling-merge in the harness. **#237 is the gate before #235 pipeline integration.**

## Key Decisions

- Frames 20→10: **shipped + verified, done** (was Fega-approved 2026-08-04 via Wick).
- Gemini billing on flowveapp@gmail.com is **paid** — #235 quota is no longer a constraint; prompts excluded from Google training.
- Variant D merge hack (score ceiling + prepend) is **harness-only** — the real integration waits on #237's fix, judged by its own ablation.
- Invalid experiment records get deleted, not kept: the first two `f10-gemD` runs (0 events reached the prompt) were removed; `f10-gemD2` is the real cell.
- RL Day9 Pt1 got no paid variant-D run — 0 Gemini events means a prompt identical to f10.

## Next Steps

1. **DONE same-day — Fega's eyeball verdicts are in (#235 comment): 2/6 soft-yes.** The discriminator is creator authorship + mic energy, not visual spectacle (keeps = his own crashes; rejects = teammate/opponent plays, talk-without-action). **Next #235 iteration:** actor-aware weighting of `gemini_visual` events using the `what` field + a watch prompt targeting the creator's own plays; re-run variant D on the same 3 recordings (proxies are cached — only the Gemini calls + replays cost, ~$1).
2. **#237** — de-saturate / interleave the top-50 event selection (per-signal caps?), gated by its own harness cell. This unblocks real #235 integration.
3. **Cut the batched installer** when Fega asks (~carries #232 chips v2, frames 10, #236) — then his chips-v2 hands-on check (reject a clip on Pending, 10 chips render).
4. **Queued:** post-#232 `--no-rejected` re-test once v2-tagged rejections dominate the 50-row window (2026-08-04: 0 of 50 RL rows carry v2 chips — they can't until the installer ships).
5. Watch #194 rolling approval stats as tagged data grows.

## Watch Out For

- **Truth shifts mid-session when Fega reviews clips:** RL Day10 went 9→13 rejected rows and EO Day4 9→12 DURING this session. Approved sets didn't change (recall comparisons stand), but rejected-hit rates across today's cells are not directly comparable. Re-pull truth counts before comparing future cells.
- **`_summary.json` pools `__run1` files only** (regenerated this session by scanning `results/`); baseline run2 exists solely as the noise-band record.
- **Proxy cache:** `tasks/spikes/replay-score/_tmp/proxy/*.proxy.mp4` (gitignored) — transcodes are atomic (tmp→rename), safe to delete to reclaim ~380MB.
- **gemini-watch.js is spike-only** — it deliberately re-implements Files API upload (prod provider's 90s processing poll is too short for 30-min proxies and `uploadFile` isn't exported). If #235 integrates, lift the longer poll into the provider properly.
- Harness fidelity caveats from session 144 still apply (ground truth only covers surfaced moments; ±1 pick noise; pooled comparisons only).

## Logs & Debugging

- **Harness:** `cd tasks/spikes/replay-score && node harness.js "<videoName>" --dry` (free) · live run ~$0.08-0.15 · variant D: `node gemini-watch.js "<vid>"` first (Gemini $0.03-0.25/recording), then `node harness.js "<vid>" --frames 10 --gemini`. Results: `results/`, pooled: `_summary.json`, Gemini events: `gemini/*.visual_events.json`.
- **Real prompts per generation:** `%APPDATA%\clipflow\processing\claude\<video>.system_prompt.txt`; token/cost lines in `%APPDATA%\clipflow\processing\logs\`.
- **Feedback DB:** `%APPDATA%\clipflow\data\clipflow.db` (repo `data/` copy is STALE). Reject-reason tags are comma-separated in `reject_reasons` (not JSON).
- Unit tests: `node src/main/ai-prompt.test.js` (52 tests).
- Boot-verify after main-process changes: `CLIPFLOW_PROFILE=dev npx electron .` (daily driver's single-instance lock makes plain `npm start` exit 0 silently).
