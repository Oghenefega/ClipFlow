# HANDOFF — Session 287 (2026-10-03)

## Current State

This session audited the app's Claude prompts and the repo's agent instructions (`/claude-api prompt-audit`). Fega applied the whole proposed diff, 75 edits across 39 files, in one commit (`6636640`).

- Clip detection on Claude now returns its answer through a JSON schema (`{clips}`).
- The overlap rule now follows Fega's answers to tick-box questions.
- CLAUDE.md, the rules, the commands and all 12 skills match the code again.

A replay on the six reference recordings scored the same as before, so it is safe to ship with the next cut.

0.5.0-alpha.20 (the #485 revamp) is still waiting on Fega's verdict.

## Key Decisions

- **Overlap rule (Fega's answers):**
  - Clips may share footage when each builds to its own payoff, or at the edges, with no fixed limit.
  - Only picks covering nearly the same stretch count as duplicates.
  - Every clip counts toward the target count.
  - A short cut plus a long cut of the same peak is still out, because they end on the same payoff.
- **Structured outputs only on the detection route.** The title/caption Claude fallback runs Sonnet 4.6, which isn't on the structured-outputs model list, so its "only JSON" prompt text stays. `extractJSON` stays for the Gemini paths.
- **Model choices unchanged.** Detection stays on Sonnet 5.5 @high. Every other Claude call keeps Sonnet 4.6, and research keeps Opus 4.6, because only detection was tested on 5.5.

## Next Steps

1. **Ask Fega how alpha.20 feels.** Suggested wording: "Did the new Rename and Projects tabs work for you? Scrubbing the big preview, Split, hovering clips, and the list shrinking into posters. Anything that felt slow or looked off?" Close #485 on his yes, and remove `status: untested`.
2. **Ask Fega whether Corva should *invite* more than one clip on a long funny stretch.**
   - Suggested wording: "The new rule lets two clips share a long funny moment, but in the test Corva barely used it: clips only shared a few seconds at the edges. Want me to nudge it to look for a second punchline in long stretches? You'd see a few more clips from your best moments, and maybe a few more to reject."
   - I recommend waiting until he has reviewed a couple of real recordings on the next cut.
3. **Ask Fega to decide the audit items left without an edit (flags in the s287 report):**
   - `/build` still launches with `npm start`. I recommend pointing it at the `scripts/dev` harness.
   - `/session-start` has no backlog step.
   - autoresearch `:security` both bans auto-fixing and offers `--fix`.
   - autoresearch `:ship` opens PRs, which CLAUDE.md forbids. I recommend deleting `:ship`'s code-PR path.
   - None of these is user-visible. They are about how sessions run.
4. **Carried from s286:** clip badges question, the per-batch review chip (`f0aa166`, `deea5e2`), Wick's icons, the clip-judge feel check + laptop check for #483, and #489 dead project-folder code.
5. **Out-of-scope findings worth issues:** `editor/utils/waveformUtils.js` and `highlights.js` / `analyzeLoudness` are dead code.

## Watch Out For

- **Detection replies are `{ "clips": [...] }` now, not a bare array.** Anything that parses detection output must read `.clips`. That covers `callLLMForHighlights` and the replay harness, which are both updated, plus any new script.
- **Replay baseline for detection is now `p55-audit`:**
  - Recall 83/90, 46% of picks on rejected moments.
  - 18.8 picks per recording, 77% coverage, $0.079 per run.
  - Compare future prompt changes against it with `node tasks/spikes/replay-score/_summ480.js p55-audit <new-label>`.
- **The skills were rewritten in many places this session.** If one now reads wrong against the code, it was this commit; fix the skill rather than working around it.
- `tasks/spikes/humor-study/_report.txt` is still an untracked leftover.

## Logs/Debugging

- **Replay log:** `tasks/spikes/replay-score/_logs/p55-audit.log` (git-ignored). Results JSONs are committed under `results/*__p55-audit__*`.
- **Gateway accepts the schema.** Structured outputs went through the Cloudflare AI Gateway (BYOK) without changes: all 18 runs returned HTTP 200 and `end_turn`.
- **Audit report and diff** are in the s287 session scratchpad (not in the repo); the commit message and CHANGELOG summarize them.
