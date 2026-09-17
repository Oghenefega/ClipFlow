# HANDOFF — Session 260 (2026-09-16)

## Current State

Master is clean at this wrap's commit. **No installer was cut** — alpha.4 is still on the feed
and on Fega's daily driver. Unshipped on master: s257 (#417), s258 (render hardening), s259
(Layout drawer), and this session's six title/caption issues. Two product commits this session.

The session was the title/caption bottleneck: #419 (rules contradicted Fega's voice), #420
(generate on approve), #421 (thinking cap), plus three filed and fixed along the way — #422
(context box ignored), #423 (Regenerate/Rephrase blind on Claude), #424 (nothing was logged).
Everything is verified: 23 real Gemini calls on five of Fega's clips for the prompt and the
thinking level (tables posted on #419/#421/#422/#423), and a CDP drive of the dev profile for
approve → cards, Regenerate, Apply, restart, switch off, and the Gemini-unavailable fallback.

## Key Decisions

- **One path for titles, no "use Claude" switch.** Fega asked for one, then saw the data (title
  take-rate 10% → 39% since Gemini) and chose Gemini only. Claude stills is the fallback and it
  is *named* on screen — "silent fallback" was the phrase that triggered the #424 correction.
- **`runTitleCaptionCall` is the only way to call the model for titles.** Generate, the
  approve path, Regenerate and Rephrase all go through it; that is what makes the logging
  claim hold. `ai_calls` (migration v12) is the operational record; `title_caption_rounds`
  stays the training record.
- **Thinking level `low`, not `minimal`.** Minimal was cheaper ($0.011 vs $0.015) but dropped
  half the context cards in the #422 run. Gemini 3.6 Flash takes a level, not a token budget.
- **The rules defer to the examples on casing, emphasis and vocabulary.** Only Title Case is
  still banned. Cold-start examples rewritten to the same shape.
- **Cards persist on `clip.suggestions`**; session cache wins when it has something, disk
  otherwise, spinner while the approve-time batch is in flight (`titlegen:pending`).
- **#420 switch ships OFF.** Fega's call when to flip it — suggestion: after the first 30 rows
  show #419 moved the take-rate.

## Next Steps

1. **Cut an installer.** The #419 scoreboard (next 30 published rows, `title_source`
   `ai`+`ai_edited` > 60% titles / > 40% captions) cannot start until the daily driver has the
   new prompt. Ten unshipped changes now.
2. **Watch for over-shouting.** New rules produced a shouted word in 15/15 titles; Fega does it
   in 67%. If the first rows read as too loud, soften "usually one" to "often one" in
   `hardRules` (`title-caption-prompt.js`).
3. **Clear `status: untested`** on #420–#424 once Fega has used them on the installed build;
   #419 stays open for the measurement.
4. Carry-overs: #418 pre-flight compliance, #416 Captions panel, #265 first-run checklist,
   s255's Google OAuth consent-screen question.

## Watch Out For

- **The dev profile was repointed at a scratch fixture twice this session and restored both
  times** (`dev-repoint.js --restore`); the backup was the pre-session file. `projectsRoot`,
  Gemini key and gateway URL are back. `autoTitlegenOnApprove` is unset in both profiles.
- **`ai_calls` rows and `titlegen_*` logs in `%APPDATA%\clipflow-dev`** (5 rows, 5 logs) are
  from this session's fixture runs, not real use. Prod has none yet.
- **The fixture** was a scratch COPY of `2026-09-02 Val Day3 Pt1` (test-mode, 0 approved,
  0 published) under the scratchpad; the real project was not touched.
- **The probe harness** (`scratchpad/titlegen-probe.js`) is not in the repo. It reproduces
  `callGemini` outside Electron's main: OLD prompt from `git show`, NEW from src, DB copy,
  stub store over prod settings. Rebuild it from `project_title_caption_paths` memory if
  the prompt changes again; do not commit it.
- **Line endings are mixed across the tree** (main.js, database.js, preload.js, SettingsView,
  RightPanelNew are CRLF; gemini.js, useAIStore, the prompt files are LF). The patch scripts
  detect and preserve; a naive script patch corrupts one or the other.

## Logs / Debugging

- Per-call record: `SELECT kind, path, fallback_reason, cost_usd, applied_at FROM ai_calls
  ORDER BY id DESC` in `%APPDATA%\Corva\data\clipflow.db` (prod) — the monthly query is in
  the header of `src/main/ai/ai-call-log.js`.
- Cost logs: `processing/logs/titlegen_*` now carry `<kind> via <path>`, a `Fallback —` line
  when Gemini did not run, and `of which thinking: N tokens (x% of output)`.
- Approve-time path: `app.log` lines `#420 generating on approve` / `#420 skipped: …` /
  `#420 generation failed` under module `title-generation`.
- Probe results and the posted tables: scratchpad `probe-results.json`, `report.md`.
