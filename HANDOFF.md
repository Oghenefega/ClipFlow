# ClipFlow — Session Handoff

_Last updated: 2026-08-04 — Session 147 (#235 actor-aware iteration D3: success criterion met, new eyeball list posted) — **no installer cut; the pending batch still carries chips v2 (#232), frames 10, #236.**_

---

## One-line TL;DR

The #235 actor-aware iteration ran end-to-end and met its success criterion: the Gemini watch prompt (v2-actor) now targets Fega's OWN plays/fails and excludes spectator moments, the harness merge classifies events by actor and drops spectator ones, and the `f10-gemD3` replay on the same 3 recordings held recall at 11/12 = 92% while eliminating both rejected spectator picks and keeping both soft-yes windows with tighter cuts — every Gemini-driven new pick is now player-authored. Fresh 9-pick eyeball list posted to #235; integration still gated on #237 + Fega's verdicts.

## Current State

Master pushed. Epic [#231](https://github.com/Oghenefega/ClipFlow/issues/231) open. [#235](https://github.com/Oghenefega/ClipFlow/issues/235) open — D3 results + new eyeball list in the latest comment; waiting on Fega's verdicts. [#237](https://github.com/Oghenefega/ClipFlow/issues/237) open — still the integration gate (untouched this session, deliberately). [#234](https://github.com/Oghenefega/ClipFlow/issues/234) open — only the queued post-#232 no-rejected re-test remains. No installer cut (batching rule).

## What Was Just Built (session 147)

- **`gemini-watch.js` watch prompt → v2-actor (#235):** recording framed as the creator's own POV capture; targets = the player's own plays and *especially own fails*; teammate/opponent spectacle and talk-without-action are explicit non-targets; `what` must start by naming the actor ("The player…" / "Teammate…" / "Opponent…" / "Unclear actor:"), bare gamertags banned. Output JSON now records `promptVersion: "v2-actor"`.
- **`harness.js --gemini` merge → actor-aware:** classifies each event from its `what` sentence (sentence-start check is authoritative, keyword scan is the v1-file fallback); spectator events dropped pre-merge + logged; player/unclear events merge at the ceiling as before. Actor counts saved into results JSON (`geminiActors`).
- **Classifier bug found & fixed mid-run:** `\bopponent\b` matched the possessive in "…into the opponent's net" and dropped a real player goal. Fix = anchor classification to the sentence start; RL cell re-run clean (10-case classifier test passed).
- **Re-watch results (v2 prompt, $0.60):** RL Day10 18→9 events (11 spectator → **0**), DD Day2 9→14, EO Day4 9→10 — 100% player-authored across all three; v2 surfaces own-fails v1 never marked (own goal at 24:08, whiffed defensive clear, backflip fail).
- **Replay `f10-gemD3` ($0.39 Claude):** pooled recall 11/12 = 92% (= D2); rejected RL spectator picks 18:29 + 25:30 GONE; DD soft-yes windows persist re-cut (6:22→6:55 vs D2's →7:06; 1:41→2:04 covering the 1:55 crash); EO checkpoint-talk pick gone, the 28:46 region re-anchored on the botched-rock-jump fail. Gemini-driven new-territory picks: 4/4 player-authored (D2: 4 of 5 Gemini-driven verdicted picks were NOs). `_summary.json` now has the pooled `f10-gemD3` row.

## Key Decisions

- Actor policy in the merge: **spectator = dropped**, not downweighted — mic signals already cover "Fega reacts loudly to someone else's play", and any score below 1.0 is invisible anyway while #237's saturation stands.
- **"Unclear" actors are kept at full weight** — v2's mandatory actor-first phrasing makes them rare, and v1-style avatar phrasing ("the egg…", "the mail truck…") is player-controlled and must not be dropped.
- v1 visual-event files were overwritten by the v2 re-watch — git history keeps them; `f10-gemD2` results files remain on disk for comparison. New event files carry `promptVersion` (absent = v1).
- #237 untouched this session on purpose — it still gates integration and gets its own de-saturation fix + harness cell.

## Next Steps

1. **Fega:** ~2-min eyeball pass on the 9 D3 picks (list in the #235 comment) — especially whether the re-cut DD windows (1:41→2:04, 6:22→6:55) are closer to keepable, and the re-framed EO 28:06→28:52.
2. **#237** — de-saturate / interleave the top-50 event selection (per-signal caps?), verified by its own harness cell. This unblocks real #235 integration (and retires the ceiling hack).
3. **Cut the batched installer** when Fega asks (carries #232 chips v2, frames 10, #236) — then his chips-v2 hands-on check (reject a clip on Pending, 10 chips render).
4. **Queued:** post-#232 `--no-rejected` re-test once v2-tagged rejections dominate the 50-row window (can't move until the installer ships).
5. If Fega's D3 verdicts land well → design the real pipeline integration (lift the long Files-API poll into the prod Gemini provider, proxy transcode stage, actor filter in the pipeline merge — all after #237).

## Watch Out For

- **Truth counts shift when Fega reviews clips mid-session** — re-pull truth before comparing cells (today RL showed 13 rejected rows vs 9 at D2 time; recall comparisons stand, rejected-hit rates across cells don't).
- **`f10-gemD3` results came from two harness code states:** DD + EO cells ran before the classifier fix, RL after — but DD/EO had 0 spectator matches under either classifier, so their merged inputs are identical; only RL needed (and got) the re-run.
- **v1 vs v2 event files:** anything comparing `gemini/*.visual_events.json` across sessions must check `promptVersion` (absent = v1). Event timestamps also shifted between v1 and v2 watches — they are different observations, not the same events re-labeled.
- `_summary.json` pools `__run1` files only; the bugged first RL D3 run was overwritten by the re-run, so no stale file remains.
- **Proxy cache:** `tasks/spikes/replay-score/_tmp/proxy/*.proxy.mp4` (gitignored, ~380MB) — transcodes are atomic (tmp→rename), safe to delete.
- **gemini-watch.js is spike-only** — deliberately re-implements Files API upload (prod provider's 90s processing poll is too short for 30-min proxies and `uploadFile` isn't exported). Lift properly at integration time.
- Harness fidelity caveats from session 144 still apply (ground truth only covers surfaced moments; ±1 pick noise; pooled comparisons only).

## Logs & Debugging

- **Harness:** `cd tasks/spikes/replay-score && node harness.js "<videoName>" --dry` (free) · live run ~$0.08-0.15 · variant D: `node gemini-watch.js "<vid>"` first (Gemini $0.03-0.25/recording), then `node harness.js "<vid>" --frames 10 --gemini --label <cell>`. The merge log prints actor classification ("N player + N unclear merged, N spectator dropped" plus each dropped event's `what` line).
- Results: `tasks/spikes/replay-score/results/`, pooled: `results/_summary.json`, Gemini events: `gemini/*.visual_events.json` (check `promptVersion`).
- **Real prompts per generation:** `%APPDATA%\clipflow\processing\claude\<video>.system_prompt.txt`; token/cost lines in `%APPDATA%\clipflow\processing\logs\`.
- **Feedback DB:** `%APPDATA%\clipflow\data\clipflow.db` (repo `data/` copy is STALE). Reject-reason tags are comma-separated in `reject_reasons` (not JSON).
- Unit tests: `node src/main/ai-prompt.test.js` (52 tests).
- Boot-verify after main-process changes: `CLIPFLOW_PROFILE=dev npx electron .` (daily driver's single-instance lock makes plain `npm start` exit 0 silently).
