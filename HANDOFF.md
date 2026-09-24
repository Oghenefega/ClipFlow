# HANDOFF — Session 276 (2026-09-23)

## Current State

Fega is still on **0.5.0-alpha.13**, with no installer cut this session. The session ran a prompt audit (report: `tasks/specs/prompt-audit-2026-09-23.md`) and landed three commits:
- **59970bf:** stale facts and dated prompting fixed across the Claude Code skills, rules and `CLAUDE.md`.
- **351f090:** clean game-research notes, cold-start detection examples, the Opus price, and the replay harness pointed at `%APPDATA%\Corva`.
- **9c74bf1 (#464):** game research now records its cost, web searches included.

The "unreleased" What's New entry is started (2 lines).

## Key Decisions

- **Game research stays on `web_search_20250305`.** Measured, `web_search_20260209` took about 2 min per call (past the 120 s timeout) and used about 10x the tokens on a well-known game. A code comment at the tools line records this.
- **The research lead-in guard and scrubber stay.** Opus 4.6 still writes "Based on my research, here is the game note:" without them. `extractText` now keeps only the text after the last search result, so pre-search narration and mid-sentence fragments are gone.
- **Cold-start examples show quote, energy and why; no invented timestamps, title or confidence.** Replays were neutral: 4+4 runs, rejected hits 38/65 vs 40/68, median 29 s in both. It shipped as a consistency fix, not a measured win.
- **Research cost goes in `ai_calls` (`kind = "research_game"`) and a cost log.** The cost includes $10 per 1,000 searches, and the search count lives only in the cost log (no new DB column).
- **`CLAUDE.md`'s TikTok line:** Fega renamed the Meta and TikTok dev apps on 2026-09-10. The TikTok rename rides in the #388 revision under review. The trademark gate still covers the GitHub repo and the Google app.

## Next Steps

1. **Carried from s275, still unasked:**
   - **#463:**
     > "Did you get a chance to try the missed-clips fix? Schedule two clips an hour apart at :30, close Corva until both times are more than 5 minutes past, then reopen it. You should get a notification, and the Queue should show both moved to the next :30 slots, still an hour apart. Did they?"

     On a yes, close #463.
   - **#461:**
     > "Open the Tracker, go back to Sep 2–4, and click one of the Robot clips you reposted this week. The popup should list the repost's day, and pressing it should jump there. Does it?"

     On a yes, close #461 and remove `status: untested`.
   - **The ↻ mark:**
     > "The ↻ mark on a repost's own card sits in the top row, next to the game tag. For a 4-letter game like 100T it squeezes the tag down to '10…'. Want me to move it into the title line, where the ↻2 on originals already sits? I'd say yes."
   - **From s273/s274:** the #454/#456/#457 check question, the real in-app #459 run (check commit free first), and the feedback rows #3/#29 question.
2. **After the next installer, ask (#464):**
   > "Open Settings → Pipeline Logs and press the research button on any game in its Edit window. A 'game research' entry should appear in the list, and the 'This month' total should go up by about 1–13 cents. Did it?"

   On a yes, remove `status: untested` from #464.
3. **Ask about a cheaper detection model:**
   > "Want me to test Claude's newer Sonnet 5 for picking clips? It costs about a third less per run than today's model. I'd replay-score it on your past recordings like any engine change, for about $2 in tests. You'd see the result as whether its picks match what you kept. I'd say yes."

   A yes also opens audit finding A7 (structured outputs replacing the JSON-forcing text on the Claude path).
4. **Fable review** of e0d3cdd, 92f0972, fe8a8dc, 3479a87 and 46ca0e9, plus this session's 59970bf, 351f090 and 9c74bf1.
5. **Watch two behavior-changing skill edits:** the UI-debug screenshot rule (the old "study 10 s / mentally simulate" steps are gone) and the performance skill's dropped score gate. If a UI fix or a performance pass goes noticeably worse, those are the first suspects; restore them from `git show 59970bf^`.
6. **Low-priority audit leftovers** (the report's Status line): dev-tooling #23-26 and the vendored autoresearch flags (react-scripts verify commands, a broken `skills/` path).
7. **#462 (repost payoff analysis)** waits for a few days of `clip_metrics_history` per repost.

## Watch Out For

- **The replay harness now reads `%APPDATA%\Corva`.** It had been silently broken since alpha.24.
  - Two harness runs started from the same folder at once race on `_tmp/` and fail with "file is not a database". Run them one at a time.
- **Baseline replays from a git worktree:** a gitignored file is missing there (`vendor/beta-token.json`), and the worktree needs a `node_modules` junction.
  - Delete that junction with `(Get-Item <path>).Delete()` BEFORE `git worktree remove --force`, or the recursive delete can follow it into the real `node_modules`.
- **Any dev-profile boot runs the Gemini game sniff on real W:\ recordings** (under 1 cent each). It's real spend, but small.
- **The research call has no explicit timeout, so it gets the provider's 120 s default.** Today it takes 9-19 s. Anything that makes it search harder (a newer tool, a longer prompt) can push it past that limit.

## Logs/Debugging

- **Research cost:** `<processingDir>\logs\game_research_<name>_<ts>.log` shows the token cost plus a `Web searches: N ($x)` line. Each call also leaves an `ai_calls` row, which you can query with `SELECT * FROM ai_calls WHERE kind='research_game'`.
- **Audit replay records:** `tasks/spikes/replay-score/results/*audit-coldstart-{base,new}*`.
