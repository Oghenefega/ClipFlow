# ClipFlow — Session Handoff

_Last updated: 2026-07-27 — Session 133 — **#199 (energy track), #194 (approval rates in-app), #193 (Gemini video titles) all built, verified, closed `status: untested`. Daily driver still alpha.24 — next installer carries all three.**_

---

## One-line TL;DR

Title/caption generation can now watch the actual clip: a temp 720p cut (with sound) goes to Gemini Flash with the unchanged voice prompt, stills remain the automatic fallback, every round records `gen_source` so the two paths' acceptance rates are comparable — plus approval rates (quality + overall, rolling + all-time) are now visible on the Projects tab, and energy analysis finally respects the transcription track setting.

## Current State

- **Three issues closed `status: untested`** (Fega hasn't seen any of it on the daily driver — no installer cut this session, per batch-versions rule):
  - **#199**: `D:\whisper\energy_scorer.py` takes `--track` (probes stream count, falls back to `0:a:0`); pipeline passes `transcriptionAudioTrack`. Verified with synthetic single/two-track files.
  - **#194**: project cards show "kept X of Y (Z%)" once fully reviewed; "Rates" chip on Projects expands per-game quality/overall × rolling-10/all-time. Numbers verified EXACT against hand SQL on prod DB (RL overall 9/144=6%, quality 9/121=7%). Quality filter = conf ≥ 0.7 minus *exclusively*-mechanical rejects (deliberately narrower than the prompt's any-mechanical filter — flagged on the issue).
  - **#193**: new native provider `src/main/ai/providers/gemini.js` (`gemini-3.6-flash`, inline ≤14MB / resumable Files API above, one retry on 503/429, thinking tokens counted as output); `ffmpeg.cutTitlePreview` cuts the clip's nleSegments union range at 720p with audio `0:a:0` (the mix render uses); temp file deleted on success/failure/fallback (verified 0 leftovers all three ways); migration v8 adds `title_caption_rounds.gen_source` ('gemini-video'/'frames' — NOT title_source, that's publish-time provenance); Gemini spend logs as a `titlegen_*` pipeline log ($0.0214 measured) counted in Settings monthly cost; Settings → API Credentials has a Gemini pill.
- **Gemini API key**: created this session on **flowveapp@gmail.com** (AI Studio, free tier). It's set in the DEV profile store. **Fega must paste it into Settings → Tools & Credentials → API Credentials → Gemini on the daily driver after the next installer.** Key visible in session transcript; rotate in AI Studio if ever concerned.
- **Free tier caveat (flagged to Fega, he's aware):** free tier = daily caps + Google may train on submitted footage (raw unpublished recordings!). Flip the AI Studio account to paid billing before this becomes the daily path.
- **Known quality limit (#193, documented on the issue):** Gemini names the visual event correctly (verified: "kickoff goal" from a clip whose transcript is "okay… oh, okay") but on the test clip credited the creator with the OPPONENT's goal — replays follow the scorer's car. One perspective-instruction iteration didn't fix it; stopped per 2-attempt rule. The `gen_source` acceptance comparison is the designed judge. Amusingly Claude+stills got attribution right (frozen banner is easier to read).
- Renderer built clean; dev-profile boot-verified (migration v8 ran); Rates panel + card line + Settings pill all driven and screenshotted via CDP.

## Key Decisions

1. **`gen_source` new column instead of the issue's literal `title_source`** — title_source classifies where the FINAL published title came from (ai/ai_edited/self); overloading it would break voice-example ranking. Both axes are needed for the acceptance comparison. Flagged on #193.
2. **Model `gemini-3.6-flash` at $1.50/$7.50 per 1M** (verified against Google's live pricing page) — real cost ~2¢/generation, ~3× the issue's estimate (that math was Flash-Lite-priced). Noted on the issue.
3. **maxTokens 8000 for Gemini (not 2000)** — 3.x thinks by default from the same output budget; 2000 can truncate to empty (measured ~2.2k thinking tokens per round).
4. **Quality-rate mechanical filter = exclusively-mechanical** per the #194 comment's wording; mixed rows ("duplicate,not-funny") still count — a mixed row carries a taste verdict.
5. **Gemini cost logs only gemini rounds** — anthropic title rounds were never cost-logged; keeping that delta minimal.

## Next Steps

1. **Cut the next installer** when the batch is ready (~this is already 3 changes; Fega's call) — then he pastes the Gemini key into Settings and generates titles on a real project to feel the video-path difference.
2. **Remind Fega: flip the AI Studio account (flowveapp@gmail.com) to paid billing** before video titles become daily-path (training-data + rate-limit reasons).
3. **Watch acceptance by gen_source** once real rounds accrue: `SELECT gen_source, title_source, COUNT(*) FROM title_caption_rounds GROUP BY 1, 2` — the measurement #193 was built for. If gemini-video rounds don't out-perform frames, consider trying `gemini-3-flash-preview` or a perspective few-shot before giving up on the path.
4. **First sessions on alpha.25+ establish the quality-rate baseline** (#196): the Rates panel's RL quality number is the one the 40% target applies to.
5. Carry-over from s132: Fega retests the 69s recording on alpha.24 (#200 floor), and a clean full-session generation confirms the contention-blocked sanity check.

## Watch Out For

- **The dev profile store now holds real credentials** (anthropic + gateway + gemini keys copied/set this session for verification). Fine on this machine; don't ship the dev store anywhere.
- **energy_scorer.py lives OUTSIDE the repo** (D:\whisper) — the #199 script-side fix is NOT in git. The `tools/` packaging move (#143 pattern) is still owed before commercial packaging.
- **Old-installer + new-script compat is safe by design**: the script's `--track` default is 1 (Fega's mic index), so an alpha.24 daily driver without the pipeline change still behaves exactly as before.
- **game-profiles repo-write hazard from s132 still stands** for headless harness runs (this session used the dev app, not the harness — repo `data/game_profiles.json` untouched).

## Logs / Debugging

- **Dev app logs**: `%APPDATA%\clipflow-dev\logs\app.log` — grep `[gemini]` (video size + inline/Files API + retry lines) and `(title-generation)` (fallback warnings with the real error). The 503-fallback event from this session is at 20:28:39.
- **Gemini cost logs**: `%APPDATA%\clipflow-dev\processing\logs\titlegen_*.log` (prod equivalent under the configured processingDir) — one per gemini round, shows tokens + $ and counts toward Settings monthly cost.
- **Temp previews**: `%APPDATA%\clipflow*\processing\titlecaption-preview\` — must always be empty after a round; files here = a cleanup regression.
- **CDP driving pattern**: scratchpad `cdp.js` (Runtime.evaluate wrapper) + `shot.js` (screenshot) against `--remote-debugging-port=9222`; `ws` installed in scratchpad, not the repo. taskkill electron before relaunching (single-instance lock).
- **Verify #194 numbers anytime**: scratchpad `verify194.js` runs the real `getApprovalStats` against a prod DB copy next to hand SQL.
- **Verification clip** (perspective-limit repro): project `proj_1784788479474_xnshl3` clip `clip_1784788710057_mtq1` — 8s edit (35.4–43.4s of `2026-07-17 RL Day8 Pt8.mp4`), transcript "okay Oh, okay.", opponent kickoff goal + Fega laughing.
