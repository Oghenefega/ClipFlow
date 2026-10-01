# HANDOFF — Session 282 (2026-10-01)

## Current State

**0.5.0-alpha.18 is on the update feed**, and Fega has been told to relaunch and click Install. It carries:
- edit tracking (#479), with the "How much you edit" line in Settings → Diagnostics
- clip detection on Claude Sonnet 5.5 at effort high, with the clip count stated per recording (#480)

Nothing is unreleased. The session opened with a strategy talk (agents, connectors, autopilot); the ideas are filed as #480-#483.

## Key Decisions

- **Detection switched to Sonnet 5.5 only after the replay test passed:** 84/90 approved found vs Sonnet 4.6's 83/90, 46% vs 51% rejected-hit, 20% cheaper, ~3 more picks per recording. Fega said yes. The base prompt on 5.5 had failed (76/90). The fix was stating the clip count as a number (one per 80 s), and 5.5 reads "roughly one per 90 s" literally. Table: `tasks/specs/detection-input-science.md` Step 6/6b.
- **Only detection moved.** The Claude title fallback and game profiles keep the provider default (Sonnet 4.6), and research keeps Opus 4.6, because only detection was tested. The model lives in `src/main/ai/detection-model.js`, which the replay harness reads by default.
- **Edit tracking counts edits by diffing autosave payloads per kind,** not by hooking undo. The AI subtitle baseline is the shared resolver, not raw `clip.transcription`.
- **Publishing stays on Fega's PC** (his call: no cloud storage for now).

## Next Steps

1. **Ask Fega how the new clip-finding feels after a couple of recordings.** Suggested wording:
   > "Corva now finds clips with the newer AI model. You'll see about 3 more clips per recording. After your next couple of recordings, do the picks feel as good as before, or is the extra review annoying? If it's too many, I can lower the count."
2. **Ask Fega to check the Resolve wording in the relink tip** (carried over from s281). Suggested wording:
   > "Next time you're in Resolve, right-click a clip in the Media Pool. Is there an option called 'Replace Selected Clip'? The Rename tab tip tells people to use it, and nobody has clicked through it yet."
3. **Ask Fega whether the React switch works on his installed app** (carried over from s280). Suggested wording:
   > "Did flipping Reacting on a real reaction recording give the right name and Day, and do your reaction shows sit under their games in Settings? If yes, I'll clear the untested flags on #472 and #474-#477."
4. **Ask Fega which idea from this session he wants first.** Suggested wording:
   > "From the 'frontier' chat: Autopilot that runs clip-finding on your renamed backlog overnight (#481), the Corva connector for Claude (#482), or the watch-and-listen test for funny moments (#483)? My pick is Autopilot. It clears the 237-recording backlog without you pressing anything."
5. **#480 remainder (a plan line, not a question):** structured output and prompt caching as their own replay cell. Moving the title fallback, research and game profiles onto 5.x each needs its own check.
6. **#478 (split quirks):** a code fix, carried over.

## Watch Out For

- **The Anthropic prepaid balance is shared by tests and production, and auto-recharge is off.** It ran out mid-test this session, which also stops Fega's real clip-finding. State a batch's total spend before running it (#56 is the spend-cap issue).
- **`W:\_corva-scratch` (518 MB) is left over** from the end-to-end pipeline test. My delete was blocked, and Fega was told he can remove it.
- **Edit tracking groups:** any new clip field the editor saves must be added to `editGroups.js`, or its edits are invisible. Fingerprint per-item properties by id, never by position, or splits and cuts register as false style or layout edits (three found and fixed this session).
- **The harness `count` prompt variant now throws on purpose**, because it shipped in `ai-prompt.js`. Drop it from `--prompt-variant`.
- **The dev profile watches the real Recordings folder.** Repoint `watchFolder`, `projectsRoot`, `outputFolder` and `testWatchFolder` before destructive tests.

## Logs / Debugging

- **Replay harness:** `cd tasks/spikes/replay-score && node harness.js "<video>" --frames 10 [--runs N] [--model id --effort lvl] [--prompt-variant a,b] [--dry]`. With no `--model`, it replays the production detection model. `--dry` writes the exact prompt to `_tmp/prompt-<label>.txt`; read it before spending. Pool a cell with `node _summ480.js <label> ...` (it needs `_tmp/approved480.json`, regenerated from a prod DB copy as in the s282 transcript).
- **Headless real pipeline:** the s282 scratchpad `fx480/run.js` (`npx electron run.js`) runs `runAIPipeline` end to end with a prod DB copy and scratch folders. A 4-minute recording took 207 s. Check commit memory first (≥8 GB free).
- **Edit-tracking dev test:** fixture recipe in the s282 scratchpad `fx479/` (`setup.js` / `restore.js` repoint dev `projectsRoot` at a copy of `proj_1785192672631_n1tazq`). `in.js` drives trusted CDP input and prints `[edit-tracker]` console lines.
- **Data:** `edit_sessions` / `edit_outcomes` live in `%APPDATA%\Corva\data\clipflow.db` (migration v15). Detection cost appears in pipeline logs as `claude-sonnet-5-5` at $2/$10.
