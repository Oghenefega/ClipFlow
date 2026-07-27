# ClipFlow — Session Handoff

_Last updated: 2026-07-26 — Session 131 — **The feedback loop is finally plugged in: detection prompt learns from rejections (#191), playstyle updater mines kept clips instead of raw transcripts (#192).**_

---

## One-line TL;DR

Both learning-loop issues built and closed (`status: untested`). The detection prompt now shows the model quoted transcript snippets of what Fega approved AND a "moments this creator rejected" section (149 rejections had never been used); the playstyle updater mines approved feedback rows + published title/caption rounds from the DB instead of raw session transcripts, so chat asides like the church play can never again become "content strategy." No installer cut — rides in the next batch.

## Current State

- **#191 and #192 closed with `status: untested`** — code verified headless against real data, but no real pipeline run has flowed through yet. Fega confirms on his next generate.
- **No version bump, no installer.** Daily driver remains `0.3.0-alpha.19`. These changes reach Fega on the next `npm run build` + reinstall (batch rule).
- **46 unit-test assertions added** — `node src/main/ai-prompt.test.js` (31) and `node src/main/game-profiles.test.js` (15), plain-node runners in the segmentWords.test.js style (electron stubbed via `Module._load`).
- Renderer untouched. Build clean, source boot clean (dev profile).

## What Was Just Built

**#191 — detection prompt learns from rejections and real snippets** — `src/main/ai-prompt.js`, `src/main/ai-pipeline.js`

- Approved examples rebuilt around quoted `transcript_segment` snippets (~180 chars, word-boundary truncation, never mid-word) + title + energy. Cross-video timestamps removed from real examples.
- New Section 8 `# MOMENTS THIS CREATOR REJECTED` — up to 15 rejected clips as snippets, `user_note` verbatim when present, framed as "do NOT pick moments like these." Omitted cleanly when a game has zero rejections.
- Pipeline fetches `feedback.getRejectedClips(gameTag, 15)` (previously zero callers) alongside the approved 20.
- Budget: `SECTION_CHAR_BUDGET = 3000` per section (~6k combined); entries dropped oldest-last once spent.
- Tier 1/2/3 archetype blending unchanged; static examples keep their Timestamp format (structural refs only).
- **Every run now writes its exact system prompt** to `processing/claude/<video>.system_prompt.txt`.

**#192 — playstyle updater mines kept clips** — `src/main/game-profiles.js`, `src/main/title-caption-log.js`, `src/main/main.js`

- `gameProfiles.generateProfileUpdate(gameTag, {creatorName})` — new home for the whole flow; the IPC handler in main.js is now 4 lines. Result shape unchanged (`{success, oldProfile, newProfile, gameName}`), diff card untouched.
- Sources: `feedback.getApprovedClips(tag, 30)` + new `titleCaptionLog.getPublishedRounds(tag, gameName, 30)`. The rounds query matches the free-form `game` column (`"rl"`, `"rocketleague"`, `"Rocket League"`) case-insensitively with spaces stripped.
- New prompt: pattern must appear in ≥2 kept clips, one-off asides banned outright, 150-300 words with a consolidate-don't-append clause (added after the first live run came back at 469 words; second run: 294).
- Thin-data guard: <5 kept datapoints → `{success: false, skipped: "thin-data", note, oldProfile === newProfile}` — no LLM call, no diff card, profile untouched.
- `getRecentTranscripts` deleted (single caller was this handler). Rejected snippets deliberately NOT fed to the playstyle prompt (spec said MAY; omitting guarantees polluted source text can't leak in).

## Verification Evidence (headless, real data)

Harness: `scratchpad/verify-harness.js` run via `CLIPFLOW_PROFILE=dev npx electron <path>` after copying the **prod appdata DB** (`%APPDATA%\clipflow\data\clipflow.db`) into the dev profile. Evidence files in the session scratchpad `evidence/` dir; key results:

- RL detection prompt: both sections present, 11 approved + 15 rejected snippets, zero `Timestamp:` lines among real clips. The church-play snippet sits in the REJECTED section — exactly where it teaches.
- RL playstyle regen via the real `generateProfileUpdate`: 294 words, **zero church/jesus/acting references** (regex-verified), patterns clearly multi-clip.
- Valorant (0 kept clips): thin-data skip, old === new, no API call.

## Key Decisions

1. **Thin-data guard returns `success: false`** so the diff card doesn't pop with identical old/new text. The renderer only renders the card on `success` — sparse games silently skip. Session count is NOT reset on skip, so it re-checks next threshold hit (no LLM cost either way).
2. **Playstyle generation moved into game-profiles.js** rather than staying inline in main.js — needed a real, callable production function for headless verification and unit tests. Handler is a thin delegate.
3. **Rejected-as-contrast omitted from the playstyle prompt** (issue said MAY). Guarantees the church-play text physically cannot reach the profile generator.
4. **Word-count enforcement via prompt rule**, not truncation — the model consolidates; code never cuts profile text.

## Next Steps

1. **Next real pipeline run**: confirm `processing/claude/<video>.system_prompt.txt` appears and the run feels better-calibrated. Remove `status: untested` from #191 when Fega confirms.
2. **Next playstyle threshold trigger**: confirm the diff card still renders and the new profile reads clean. Remove `status: untested` from #192.
3. Installer batch is accumulating (this session = 2 changes since alpha.19). Cut when ~10 or on ask.

## Watch Out For

- **The repo `data/clipflow.db` is STALE** (64 feedback rows, no `title_caption_rounds` table). Real data lives in `%APPDATA%\clipflow\data\clipflow.db` (packaged app). Source-run prod (`npm start`) reads the stale repo copy — measured counts must come from the appdata DB.
- **`title_caption_rounds.game` is free-form** — any new query against it must normalize (lower + strip spaces) like `getPublishedRounds` does, or it silently drops rows.
- **`npm start` exits 0 immediately when the daily driver is running** (single-instance lock, shared prod profile). Boot-verify with `CLIPFLOW_PROFILE=dev npx electron .` instead — separate lock, still loads `build/`.
- The two prompt test files stub electron via `Module._load` intercept — they must keep running under plain `node`, don't convert them to require real electron.
- Backups made this session: `%APPDATA%\clipflow-dev\data\clipflow.db.bak-s131` and `game_profiles.json.bak-s131` (dev DB was overwritten with a prod snapshot for verification — that's the sanctioned direction, but the dev profile now mirrors prod data as of tonight).

## Logs / Debugging

- Headless harness output: session scratchpad `evidence/RL.system_prompt.txt` (the logged prompt) and `evidence/RL-playstyle-regen.json` (full regen result).
- Dev-profile app log: `%APPDATA%\clipflow-dev\logs\main.log` — clean boot at 22:27 (`App started 0.3.0-alpha.19`, schema v5, backfill 0 inserted).
- Anthropic calls went through the CF gateway (BYOK) — two calls this session (first regen 469 words, second 294 after the consolidate clause).
- Unit tests: `node src/main/ai-prompt.test.js && node src/main/game-profiles.test.js` — 46/46 green.
