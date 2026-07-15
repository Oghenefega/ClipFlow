# ClipFlow — Session Handoff
_Last updated: 2026-07-14 — Session 100 — **Publish-day debugging arc: YT token, tracker honesty, frozen goal ring, queue-at-launch. Alpha.15 cut, installed, and verified by Fega.**_

---

## One-line TL;DR
Fega's first real publish day in a while surfaced five bugs; all five fixed, verified, and shipped in `0.1.8-alpha.15` (installed + confirmed: ring shows 3 of 48). YouTube OAuth needs a Google Cloud Console action (Testing → Production) or it dies again in ~7 days.

## Current State
- **Installed daily driver: 0.1.8-alpha.15** — Fega installed it this session and confirmed the Tracker weekly goal now reads 3 of 48 / Rocket League 3. Everything through commit `efb77db` is live.
- All four session-100 fixes are user-verified or CDP-verified (see below); session 98's queue pencil/propagation verification is now moot-or-easy since he's publishing for real again.
- Working tree: usual never-commit `data/` pair + untracked `tasks/mocks/` scratch.

## What Was Just Built
- **YouTube publish failure diagnosed (not a code fix):** "Token refresh failed: Bad Request" = Google `invalid_grant` — refresh tokens die after 7 days while the OAuth app is in **Testing** mode. Fega reconnected and posted. Filed **#163**: surface "reconnect in Settings" instead of raw Google errors + flag the account (TikTok path has the same weakness).
- **Tracker retry credit (`6c9bbf8`)** — `logPost` ([QueueView.js](src/renderer/views/QueueView.js)) now records the union of captured publish results + the clip's persisted `publishState` successes instead of currently-enabled toggles. Retrying with already-posted platforms toggled off no longer logs a "1 platform" entry. Also repaired that day's entry in prod data (backup: `clipflow-settings.json.bak-20260714-133950` in `%APPDATA%\clipflow`).
- **Weekly goal ring / all-time XP un-frozen (`ed7555a`)** — the count-up effect in [TrackerView.js](src/renderer/views/TrackerView.js) ran once at mount (before store data loaded) → froze at 0 forever. Now re-animates from the last shown value on `[posted, target, totalXp]` changes.
- **Main game finally counts (`ed7555a`)** — `mainGameTag` ([App.js:84](src/renderer/App.js)) carried the game's *hashtag* ("rocketleague") while clips store the short tag ("rl") — never equal, so every auto-post ever was "Variety" (also silently broke Queue main-game badges). Prop now carries `tag`; manual-log comparison in TrackerView updated to match.
- **Main-vs-Variety computed live (`ed7555a`)** — the split now compares each entry's game to the *current* Now Playing (matching both short-tag auto entries and hashtag manual entries), so switching games mid-week re-buckets the week. Stored write-time `type` remains for history/CSV export only.
- **Queue populated at launch (`28c8a46`)** — `listProjects` ([projects.js](src/main/projects.js)) summaries now include `clips` minus the two measured-heavy fields (subtitles, per-clip transcription ≈85% of payload). Fixes the long-standing "queue is empty until I open a project" bug AND its hidden twin: the auto-publish scheduler read the same empty list, which is why a 2:30 PM scheduled post only fired at 3:05 (after a project load made it visible).
- **Installer `0.1.8-alpha.15` cut (`efb77db`)** — promotes sessions 99–100.

## Key Decisions
- **Main/variety is a read-time classification, not write-time** — Fega expects posts of the newly-active game to count immediately and retroactively; `mainGameAtTime` still records history.
- **Late-fired scheduled posts log at actual post time** (3:30 slot, not the scheduled 2:30) — Fega explicitly OK'd this ("if it went live at 3:05 then that's fine"). No issue filed.
- **Google OAuth stays in Testing mode for now** — Fega was told to flip the consent screen to "In production" in Google Cloud Console (unverified-app warning is acceptable); full Google verification is a launch-ops item anyway.
- **Summary-with-stripped-clips over full project loads at startup** — measured on real data (5 projects ≈ 2.1 MB total; subtitles+transcription are the weight). Entering a project still loads full data.

## Next Steps (prioritized)
1. **Fega flips the Google consent screen to Production** ([console.cloud.google.com](https://console.cloud.google.com/apis/credentials/consent)) — otherwise YouTube dies again ~Jul 21 and every reconnect only buys a week.
2. **#163** — actionable "reconnect in Settings" error + account badge on `invalid_grant` (YouTube + TikTok refresh paths).
3. Carried: **#162** (undo of segment-mode switch doesn't restore the dropdown label), **#161** (Sundays product decision), Tracker Phase 1 closeout is effectively DONE (real publishes flowed through Queue → Tracker this session).

## Watch Out For
- **The old `type` field on tracker entries is now display-dead** (read-time split) but still written and still in CSV export — don't "clean it up" without deciding CSV semantics.
- **Dev profile (`%APPDATA%\clipflow-dev`) holds a seeded copy of prod data from today** (`npm run dev:seed -- --force` was run) — stale from now on; re-seed before using it for anything data-sensitive.
- **Computer-use grant quirk:** "electron.exe" no longer resolves for the source-run app; "ClipFlow" resolves to the *installed* exe. Workaround that worked well: launch dev with `--remote-debugging-port=9223` and verify via CDP (`Runtime.evaluate`, `window.clipflow.*` IPC calls from the page). Scripts in this session's scratchpad.
- Publish-log timestamps are UTC; app.log timestamps are local EST — don't mix them up when reconstructing timelines (bit me once this session).

## Logs/Debugging
- **Publish forensics live in `%APPDATA%\clipflow\clipflow-publish-log.json`** (per-platform status + raw API responses — this is what proved `invalid_grant` and the 3:05 fire time). Tracker entries: `clipflow-settings.json` → `trackerData`.
- Google `invalid_grant` renders as `error_description: "Bad Request"` — always read the `error` field, not just the description.
- Sentry query (unresolved issues) returned empty this session — no renderer crashes; org/project `flowve/clipflow`, token at `C:\Users\IAmAbsolute\.claude\sentry_token.txt`.
- Builds clean: `npm run build:renderer` ×2 (~15s each) + full `npm run build` for the installer (alpha.15, 116 MB NSIS).
