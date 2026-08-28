# HANDOFF — Session 214 (2026-08-28)

## Current State

**The 8-request batch is planned and Session 1 of 5 is built, verified, and pushed (`038262f`).**
Fega's eight asks are filed as #324–#331; he approved the 5-session grouping (order as numbered)
and picked **option (b) for #329** (main-process scheduler — recorded on the issue). Session 1
shipped: #326 (splash ≥2s hold + slow grow, min-hold path live-proven), #327 (tracker logs exact
post times, verbatim render proven via seeded entry), #330 (What's New modal after updates, full
loop CDP-verified). All three `status: untested`, riding the next installer cut.

**⚠ INCIDENT: the dev profile published for real.** The two verification boots fired the Queue's
auto-publish tick on two of Fega's overdue scheduled clips ("GTA 6 gunplay LOOKS INCREDIBLE" and
"GTA 6 feels like a movie") — both went out to his REAL Facebook, TikTok, and Instagram at
~1:15–1:17 AM EST (YouTube failed both times: expired token). Cause: shared projectsRoot + live
OAuth tokens sitting in the dev profile (stale s182 belief said dev had none). Mitigation applied:
`%APPDATA%\clipflow-dev\clipflow-tokens.json` emptied to `{}` (backup `clipflow-tokens.backup-s214.json`
beside it) — dev can never publish again. Full lesson in tasks/lessons.md + memory (CDP gotchas,
s214 block). **Fega has NOT yet seen or responded to this.**

## Key Decisions

1. **#329 = option (b)**, main-process scheduler; formally amends "Close = quit" when built.
2. **What's New starts "caught up"** — migration stamps the current version, so the first update
   AFTER the feature ships is the first to announce itself. Real-world proof is two cuts away.
3. **Tracker back-fill skipped deliberately** (#327) — old entries keep snapped times; real
   timestamps survive on clips if ever wanted.
4. **Release loop now owns notes curation** — at cut time, rename `"unreleased"` in
   `src/main/release-notes.js` to the real version (step added to clipflow-update-launcher skill).

## Next Steps

1. **Fega checks the two 1:15 AM posts** on FB/TikTok/IG — keep or delete is his call. They were
   his scheduled clips with his captions; only the timing was not his.
2. Those two clips sit **partially published** (YouTube legs pending) — reconnect YouTube in
   Settings, then Retry from the Queue. Note: their tracker/training entries landed in the DEV
   store, so the prod Tracker won't show them unless the retry completes them prod-side.
3. **Session 2: Queue redesign** (#325 + #324) — HTML mock first (side panel + platform colors +
   hierarchy), build after Fega's nod. Then settings (#331), themes (#328), publish mode (#329).
4. Next installer cut batches this session's three fixes (per the ~10-changes rule).

## Watch Out For

- **Dev tokens must STAY `{}`** — any `dev:seed` re-copies them; re-empty immediately after. Check
  before every dev boot. A scheduled clip in the real library is a loaded gun for any profile.
- **`release-notes.js` "unreleased" must be renamed at cut time** or the update ships silent
  (skill step 2 covers it — don't skip).
- **The two half-published clips + #323**: if a platform gets toggled after this partial publish,
  #323's invisible-clip corner can bite on retry.
- QueueView no longer has `snapToSlot`/its own `parseTimeToMinutes` (TrackerView keeps its own
  copy — untouched, still used there).

## Logs/Debugging

- Publish evidence: `%APPDATA%\clipflow-dev\clipflow-publish-log.json` tail — FB post ids
  `1109202255101909`/`1109202925101842`, IG `18026804498902392`/`18097961075373678`, TikTok ok
  (no ids logged), YouTube "connection expired" both clips.
- Splash min-hold proof: dev app.log `Main window revealed (renderer-ready+min-hold)` (01:14:38
  boot A with temp 20s hold; 01:17:38 boot B on the real 2000ms — warm boot beat 2s).
- CDP probe scripts in the session scratchpad (`1fc199cf…\scratchpad`): `probe-s1.js`,
  `seed-dev-store.js`. Sidebar nav needs coordinate clicks (leaf `.click()` doesn't nav; visible
  Tracker span found at ~(998,841) @1280×860; an H1 twin is 0×0 — filter by rect).
- Seeded `vtest-327` tracker entry removed; dev store's `lastSeenVersion` now stamped alpha.8.
