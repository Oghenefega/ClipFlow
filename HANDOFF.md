# ClipFlow — Session Handoff

_Last updated: 2026-08-06 — Session 155 (YouTube weekly token death diagnosed + cured at the root; #246 auto-research/play-style plan approved; game research backfilled for 7 games; implementation deferred to next session by Fega — context budget)._

---

## One-line TL;DR

The recurring "YouTube didn't post — timeout" was never a timeout: Google's OAuth consent screen sat in Testing mode and killed the refresh token every 7 days (failures 7/14, 7/22, 7/29, 8/5 — exact cadence). Fega flipped it to Production AND reconnected — cured. Separately, the game-research feature was found to be half-broken (research never reached the pipeline — dead field read since March), the full #246 plan (auto-research on add + skippable play-style step + evidence-based re-ask) was approved, and Step 1 (backfill research for all 7 unresearched games) is DONE. Steps 2–4 implement next session.

## Current State

Master pushed (`2f4776a` plan + this wrap commit). Daily driver = **0.3.0-alpha.40** unchanged — **zero code changes this session** (plan + data + diagnosis only). The approved plan lives in `tasks/todo.md` ("PLAN (session 155)" section) with Step 1 marked done. Prod `clipflow-settings.json` now has `aiContextAuto` populated for all 10 games (7 backfilled this session); backup at `%APPDATA%\clipflow\clipflow-settings.backup-2026-08-06.json` — keep until the next build verifies clean.

## What Was Done (session 155 — no code)

- **YouTube root cause nailed and closed out (#163 comments).** Publish log (`%APPDATA%\clipflow\clipflow-publish-log.json` — NOT app.log; refresh failures never reach electron-log, see [main.js:4055-4058](src/main/main.js)) showed `invalid_grant: "Token has been expired or revoked"` on an exact 7-day cadence. Google kills refresh tokens for Testing-status consent screens after 7 days. Fega flipped to "In production" (screenshot verified) and reconnected post-flip, so the stored token is now long-lived. Any future YouTube `invalid_grant` is a NEW problem.
- **#245 filed (bug):** the Edit modal saves research to `aiContextAuto` ([modals.js:289](src/renderer/components/modals.js)) but the pipeline reads dead `aiContext` ([ai-pipeline.js:734](src/main/ai-pipeline.js)) — mismatch since the two features were built 10 days apart in March. Researched game knowledge has NEVER reached detection; it only feeds editor titles via `useAIStore` `gameContextAuto`.
- **#244 filed (improvement):** scheduled publishes must fail loudly — pre-flight token check before slots, OS notification + banner on failure, one-click retry after reconnect.
- **#246 filed (feature) + plan approved by Fega:** auto-research on add, play-style as an extra Add Game wizard step with prominent Skip, evidence-based re-ask ("here's what we've noticed — confirm or tweak") reusing #192's threshold machinery, both play-style stores write-through unified.
- **Step 1 of the plan executed:** all 7 unresearched games (RL, Val, EO, DD, PoP, SCoG, MC) researched via the app's exact prompt/model (claude-opus-4-6 + web search through the CF gateway), spot-checked accurate (no hallucination on the niche titles), citation-fragment whitespace flattened, written to prod settings with the app closed. Just Chatting excluded (content type). ~1,000–1,300 chars each.

## Key Decisions

- **#245 wire ships only through a #234 ablation cell** (spec `tasks/specs/detection-input-science.md` — replay scores, not vibes). Cell needs the backfill (done) because the six harness recordings are RL/EO/DD. Injection capped ~1,500 chars (Pico's 8.4k outlier must not eat budget). Recall holds → ON next installer; degrades → behind a default-OFF setting + verdict in #245.
- **Play-style save writes BOTH stores** (`aiContextUser` + `game_profiles.json` playStyle) — ends the silent divergence where the pipeline reads one and the editor the other.
- **Re-ask = evidence draft, not a cold question** (Fega: "very good point... Let's do this"). Existing 5-run threshold + ≥5 kept-datapoints guard unchanged.
- **AddGameModal's fake 2s "Generating..." step becomes honest copy** ("Researching in background — you can keep working") — Fega: "handle it now" → lands with Step 3a next session.
- **Session split was Fega's call** (200k+ tokens): plan + data this session, implementation next.

## Next Steps (priority order)

1. **Implement the session-155 plan Steps 2–4** (`tasks/todo.md`): (2) `aiContextAuto` wire + 1,500-char cap + harness `--no-gamecontext` flag + six-recording cell vs the post-#238 rebaseline (26/29 / 47% / 87%), results to #234, Fega signs off; (3) auto-research on add + play-style wizard step + empty-profile reframe of the Play Style Update card + step-2 copy; (4) build, verify, CHANGELOG, batch into alpha.41+ with session 154's items.
2. **Fega runs the #240 6-step import verification** (standing, three sessions deferred — runs fine on alpha.40).
3. **#243 untested label** — clears on real-use collision of two schedule times.
4. **#225 Part B** when a real publish can verify (IG permalink, TikTok post-id re-poll).
5. **#234 v3 re-test trigger check at session start** (standing): count v3 chips in RL's 50-row rejected window; fire at ≥15.
6. **Watch:** if YouTube ever shows `invalid_grant` again it's NEW (memory `project_youtube_weekly_token_death` says resolved). #163/#244 app-side work still needs separate approval.

## Watch Out For

- **Prod settings were edited outside the app** (app closed, backup kept). If anything about games looks off on next launch, diff against `clipflow-settings.backup-2026-08-06.json` before hand-fixing. The 7 new `aiResearchedAt` stamps are `2026-08-06T04:49:18.010Z`.
- **The backfilled research is NOT yet visible to the pipeline** — that's the point of Step 2. Don't "verify" detection improvement before the wire + cell land.
- **Publish failures live in `clipflow-publish-log.json`, not app.log** — token-refresh failures return early without an electron-log line. Grep the JSON first next time publishing "did nothing".
- **JC (Just Chatting) has empty `aiContextAuto` on purpose** — content type, not a game. The Step 3 auto-research and any future sweep must keep excluding `entryType: "content"`.

## Logs/Debugging

- **Backfill script + per-game cache** in session scratchpad (`6b7dbb5c…/scratchpad/backfill-research.js`, `research-cache.json`) — rerunning is safe (skips researched games, resumes from cache).
- **Evidence trail for the YouTube diagnosis:** app.log lines 38843–38940 (session `sess_184c26a5c546`, 8/5: FB/TT/IG succeed → `(youtube) Token expired, refreshing` → silence), publish-log entries 18:31Z + 19:31Z with raw `invalid_grant` responses. Posted to #163.
- No builds run this session (no code). Sentry untouched.
